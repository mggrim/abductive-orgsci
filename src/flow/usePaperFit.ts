/**
 * Judging the papers when they arrive, from whichever surface they arrived on
 * (M29c).
 *
 * Three surfaces can put a paper in front of the tool: the upload on Material,
 * the typed list on Material, and the same typed field in the Framing band on
 * Design. A fourth occasion is not an arrival at all: the framing save that
 * first makes the study judgeable, or that moves it enough to make every
 * standing verdict stale.
 *
 * All four take this hook rather than each assembling the call for itself. The
 * alternative was four call sites deciding independently what a paper is, when
 * it counts as new and what to do with a dismissed notice, which is four
 * chances to disagree about a question the researcher will see the answer to.
 *
 * It reads the corpus and the record itself, so a caller passes nothing but the
 * study, and it writes through the ledger the caller already holds. Failure is
 * swallowed on purpose: a model call that fails must not take a save with it,
 * because the save is the researcher's work and the verdict is the tool's
 * opinion about it. An unjudged paper is judged on the next save.
 */

import { useCallback, useEffect, useRef } from "react";
import { useLedger } from "../state/ledgerContext.tsx";
import { listChunks, listDocuments } from "../state/projects.ts";
import { serialise, type SaveLoop } from "../state/serialise.ts";
import { activeInferenceClient } from "../ui/personaRun.ts";
import { detectBridge } from "../inference/cliBridge.ts";
import { studyContext, type StudyDataInput } from "../interview/studyContext.ts";
import { judgeArrivingPapers } from "../proposals/paperFit.ts";
import { paperRefs } from "../proposals/theory.ts";
import { dataOnly, type Chunk, type StoredDocument } from "../state/chunks.ts";
import type { OntologyGraph } from "../ontology/schema.ts";
import type { ProjectBrief } from "../state/projects.ts";

/**
 * How often a passage has been opened, from the record.
 *
 * Attention is the best available proxy for which material the researcher
 * thinks is central, and the digest shows three passages, so which three is
 * worth getting right.
 */
export function openedCounts(
  events: readonly { readonly type: string; readonly projectId: string }[],
  projectId: string,
): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const event of events) {
    if (event.type !== "attention" || event.projectId !== projectId) continue;
    const chunkId = (event as { readonly chunkId?: string }).chunkId;
    if (chunkId === undefined) continue;
    out.set(chunkId, (out.get(chunkId) ?? 0) + 1);
  }
  return out;
}

export interface JudgeNow {
  /**
   * The brief, and nothing else the caller has to be right about.
   *
   * It used to take the documents and the passages as well, from whichever
   * render the calling component last had. That is how a paper uploaded while
   * another was being judged went unjudged for ten minutes: the run in flight
   * was working from an array read before that paper existed. The hook reads
   * the corpus and the record itself now, on every pass.
   */
  (input: { readonly brief: ProjectBrief; readonly graph?: OntologyGraph }): Promise<number>;
}

/**
 * Judge whatever needs judging, and append what comes back.
 *
 * Returns how many events were written, so a caller can refresh only when
 * something changed. Zero is the common case and costs no model call: the diff
 * inside `judgeArrivingPapers` is what makes a save cheap.
 */
/**
 * How many passes one call may make before it stops asking (walk item 5).
 *
 * A pass judges everything that needs judging, so a second pass only happens
 * when a paper arrived while the first was running. Two or three is generous;
 * the ceiling is here so a bug that makes a paper permanently "due" costs a
 * handful of calls rather than every call the researcher has.
 */
export const MAX_JUDGE_PASSES = 4;

/**
 * One loop per study, shared by every component that judges (walk item 5).
 *
 * A ref would give each component its own, and there are two: the framing band
 * on Design and the papers section on Material. The walk caught them racing —
 * two `paper-fit` events for one paper three seconds apart, at 17:01:54 and
 * 17:01:57 — because each run read the record before the other had written to
 * it, so both found the same paper unjudged and both paid for a call.
 *
 * Keyed by study, so two studies open at once do not queue behind each other.
 * Module-level because the thing being serialised is writes to one ledger, and
 * a ledger is not a property of a component.
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
export function resetJudgeLoops(): void {
  LOOPS.clear();
}

/**
 * Judge whatever is due when a surface that shows verdicts opens (M33 fix).
 *
 * Judging used to happen on three arrivals and one framing save, and every one
 * of them is something the researcher does. That is right for a paper arriving
 * and wrong for everything else that can make a verdict stale, because the
 * other things are the tool changing under them. Two shipped in one week: the
 * baselines field, which every verdict written before it lacks, and the framing
 * digest, whose separator changed. Both left a paper judged-but-out-of-date
 * with nothing on any screen to say so and no way to fix it except to type
 * something into the framing and save.
 *
 * So a surface that shows what a paper is for asks once when it opens. It costs
 * nothing when nothing is due: `papersNeedingJudgement` is a pure diff over the
 * record, so a study whose papers are all current pays one storage read and
 * makes no model call at all.
 *
 * Once per study per mount, and one judge at a time: the loop `usePaperFit`
 * holds is keyed by study and shared by every caller, so Material and Design
 * both opening cannot put two judgements of one paper on the record. That race
 * is the one the walk caught at 17:01:54 and 17:01:57, and this is the guard
 * that already fixed it.
 *
 * `ready` is what says the caller knows the brief. Firing before it loads would
 * judge every paper against a study that reads as empty, which `canJudgeFit`
 * refuses, and the refusal would be this hook's one shot.
 */
/**
 * Whether a judgement would actually happen (M33 fix).
 *
 * The surfaces flip a "judging" flag around every call, and the paper's row
 * draws a chip from it and holds back what it would otherwise say. With nothing
 * connected there is no judgement to wait for, so the chip was reporting work
 * that was never going to start and the row underneath stayed blank behind it.
 *
 * One helper rather than a check per judging occasion, because there are four
 * of those and they must not disagree about whether the tool is working: the
 * upload, the typed list, the framing save and the page opening. Three of them
 * reach it through `judgeArrivals` in the papers section, and the fourth
 * through the async form below. The count in this note used to read as four
 * calls of this function; there is one, and it is that guard (M35).
 */
export function judgingAvailable(): boolean {
  return activeInferenceClient().live;
}

/**
 * The same question, asked after the bridge probe has answered (M35).
 *
 * `bridgeDetected` reports `true` only once the probe has come back, and
 * `false` for the whole time it is in the air. That is the right answer for a
 * control the researcher just pressed, because by then the probe has long since
 * settled. It is the wrong answer on mount, and the walk of 2026-09-09 is what
 * it costs: a fresh study loaded out of IndexedDB before the probe answered, so
 * the mount judge saw a mock client, refused to judge with it, and never asked
 * again. The paper sat at "Not judged yet" for eight minutes through a reload,
 * and the second reload judged it in thirty one seconds. Which one won was a
 * race between a store read and a fetch.
 *
 * One await on the memoised probe, not a poll. `detectBridge` reaches the
 * network once per page load and every later caller gets the same settled
 * answer, so this costs the first caller the probe and everybody else nothing.
 *
 * The early return matters as much as the await: a session token means the tool
 * is already live and there is no probe worth waiting for, and holding the
 * judge for a five second health timeout in that case would be a new delay
 * bought with nothing.
 */
export async function judgingAvailableAsync(): Promise<boolean> {
  if (judgingAvailable()) return true;
  await detectBridge();
  return judgingAvailable();
}

export function useJudgeOnMount(
  projectId: string,
  ready: boolean,
  run: () => Promise<void>,
): void {
  /* The study this has already asked about. Keyed rather than a boolean, so a
   * component kept mounted while the route moves to another study asks again
   * for that one and not twice for this one. */
  const asked = useRef<string | null>(null);
  /* The latest closure, read without depending on it. `run` closes over the
   * brief and is a new function on every render, so a dependency on it would
   * make this an effect that fires on every render rather than on the first. */
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    if (!ready || asked.current === projectId) return;
    asked.current = projectId;
    /* Wait for the probe before deciding (M35). Marked asked above rather than
     * here, so the double-invoked effect `StrictMode` runs cannot start two
     * waits that both come back live.
     *
     * Swallowed for the reason every other judging call is: a model call that
     * fails must not take a surface down with it, and an unjudged paper is
     * judged on the next save or the next time this page opens. The papers
     * section says what went wrong itself, on the paper's own panel. */
    void (async () => {
      if (!(await judgingAvailableAsync())) return;
      await latest.current();
    })().catch(() => undefined);
  }, [projectId, ready]);
}

export function usePaperFit(projectId: string): JudgeNow {
  const { appendAll, readEvents } = useLedger();
  const latest = useRef<Parameters<JudgeNow>[0] | null>(null);
  const written = useRef(0);

  return useCallback(
    async (input) => {
      latest.current = input;
      written.current = 0;
      await serialise(loopFor(projectId), async () => {
        const call = latest.current;
        if (call === null) return false;
        /* No model, no verdict (M33 fix).
         *
         * With nothing connected `activeInferenceClient` hands back a mock, and
         * this loop was recording what it said as a judgement about the
         * researcher's reading list: a paper marked "fits your setting" on the
         * strength of a canned string. It mattered less while judging ran only
         * on a save the researcher made; it fires when the page opens now, so a
         * researcher who has not connected a model would have had every paper
         * judged for them by nothing.
         *
         * The same guard the checks make before they run. Silence is the honest
         * state, and the row already has a sentence for a paper nobody has
         * judged. */
        const { client, live } = activeInferenceClient();
        if (!live) return false;
        let wrote = 0;
        for (let pass = 0; pass < MAX_JUDGE_PASSES; pass += 1) {
          /* Read the corpus and the record afresh on every pass.
           *
           * The walk: one paper stored at 16:51:08 and judged at 16:52:05, a
           * second stored at 16:52:01 while that call was in the air, and no
           * verdict for it ten minutes later. The run in flight was working
           * from a list of papers read before the second one existed, and
           * nothing asked again when it finished. */
          const [documents, chunks, events] = await Promise.all([
            listDocuments(projectId),
            listChunks(projectId),
            readEvents(projectId),
          ]);
          const papers = paperRefs({
            documents,
            chunks,
            ...(call.brief.seminalCorpus === undefined
              ? {}
              : { typedList: call.brief.seminalCorpus }),
          });
          if (papers.length === 0) break;

          /* The data half of the judgement (M29c). Data passages only: a paper
           * is not evidence about the setting, and handing the reader one paper
           * as context for judging another is how a reading list starts
           * agreeing with itself. */
          const data: StudyDataInput = {
            chunks: dataOnly(chunks),
            documentNames: new Map(documents.map((d) => [d.id, d.name] as const)),
            openedCounts: openedCounts(events, projectId),
          };
          const context = studyContext(call.brief, call.graph, data);
          const batch = await judgeArrivingPapers({
            projectId,
            papers,
            context,
            events,
            client,
            /* Written as each paper is judged rather than after the last one
             * (M33 fix 2). Six papers is six model calls, and the record held
             * nothing until all six came back: the walk read a page forty
             * seconds after opening it and concluded the judge had not run.
             *
             * The only write path, which is why nothing appends the array that
             * comes back: doing both would put every event on the record
             * twice. */
            onJudged: async (written) => {
              await appendAll(written);
              wrote += written.length;
            },
          });
          void batch;
          /* Another pass only when this one actually judged something. A pass
           * that wrote nothing but a withdrawal has nothing left to find, and
           * one that wrote nothing at all is the common case. */
          if (!batch.some((event) => event.type === "paper-fit")) break;
        }
        written.current += wrote;
        return wrote > 0;
      });
      return written.current;
    },
    [appendAll, readEvents, projectId],
  );
}
