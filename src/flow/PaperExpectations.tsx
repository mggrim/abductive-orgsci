/**
 * What one paper expects, on its row on Material (M33).
 *
 * The owner's ask: "the paper assessment shouldn't just examine fit, it should
 * establish the baseline expectations from the literature." A verdict alone
 * tells the researcher the tool has an opinion about their reading list. What
 * the paper expects is the thing they can argue with, and it is the thing the
 * interviewer will put to them.
 *
 * Three states, and the third is the one a row could not show before. A paper
 * nobody has judged says so and says what would fill it in, because silence
 * there reads as approval. A paper judged with nothing to expect says that too,
 * which is a real answer about a paper and not a gap. Otherwise the
 * expectations are listed, each with where its authors say it holds.
 *
 * Two controls per expectation and neither of them is a model call. Adding one
 * stages it in the tray, through the same door as everything else, so accepting
 * it is still the researcher's act and the page it becomes still carries
 * `literature-derived`. Turning one down writes the pair of events every
 * declined question in this tool writes: nothing is deleted, and the `paper-fit`
 * event that holds the expectation is never rewritten, because a decline is
 * what the researcher said about the paper and not a correction of it.
 *
 * The same component draws an uploaded paper's row and a typed line's, because
 * a line the researcher typed is the case where this matters most: its
 * expectation comes from a model's memory of a citation rather than from a file
 * anyone read, and the researcher is the only one in the loop who can catch a
 * fabrication.
 */

import { useCallback, useState } from "react";
import type { LedgerEvent, PaperBaseline, ProposalEvent } from "../ledger/events.ts";
import {
  BASELINE_DECLINES,
  BASELINE_SECTION,
  baselineDeclineEvents,
  baselineScopeLine,
  type BaselineDeclineId,
  type SettledBaselines,
} from "../proposals/baselines.ts";
import type { PaperVerdict } from "../proposals/paperFit.ts";
import { NO_SOURCE_FILE } from "../proposals/baselines.ts";
import { useLedger } from "../state/ledgerContext.tsx";
import { StatusChip } from "../ui/components/index.ts";
import { providerField, type Provider } from "../inference/types.ts";
import { ONTOLOGY_TAB_LABEL } from "../concepts/vocabulary.ts";

/** What the row says when nothing has judged this paper, and nothing could. */
/* ISC-587 ruling (lead, 2026-09-30): the puzzle is answered on Design now, so
 * the note names the two steps that make a paper judgeable and where they are. */
export const NOT_JUDGED_NOTE =
  "Answer the Context or Puzzle step on Design so Abductive can judge this paper.";

/**
 * What the row says when nothing has judged the paper (M35, corrected D20).
 *
 * Two cases, and the first sentence was only right about one of them. It asked
 * the researcher to fill in their puzzle or their setting, which is what makes a
 * paper judgeable at all, and the walk of 2026-09-09 read it on a study whose
 * framing was complete. So when the framing says enough, the row says what is
 * true then.
 *
 * What it then said was "Press <the bulk control> to read the paper now", and
 * that was false in two ways at once (D20, M43b). The control has not made a
 * model call since M33: it stages expectations that were already written when the
 * paper arrived, so it cannot read a paper nothing has read. And it acts on every
 * paper, so offering it as the way to read this one is how the walk of 2026-09-13
 * came to stage all seven expectations of four papers while trying to read the
 * fifth. No control on this page reads one paper.
 *
 * What does read a paper is the judge, which runs when a paper arrives and again
 * when the framing it was judged against moves. Saving the framing is the lever
 * the researcher has, so that is what the sentence names.
 */
export function notJudgedNote(input: { readonly judgeable: boolean }): string {
  if (!input.judgeable) return NOT_JUDGED_NOTE;
  return "Abductive hasn't read this paper yet. Abductive reads a paper when the paper arrives, and again when you save your starting point.";
}

/**
 * What it says when the paper was read and nothing was written down from it.
 *
 * It read "This paper expects nothing about a setting like yours", which is the
 * sentence a co-author met on Ozcan and Santos on 2026-09-21 and the reason they
 * called the tool self-confident: a claim about the paper, made by a model, in
 * place of anything they could answer.
 *
 * What is true in every case that reaches this sentence is about the tool's own
 * reading rather than about the paper, so that is what it says now. Three
 * surfaces print it (the row on Material, the band on Design and the companion
 * panel), which is why the wording is here and not in any of them.
 */
export const NOTHING_EXPECTED_NOTE = "Abductive read this paper and found the paper silent on a setting like yours.";

/**
 * What it says once the researcher has answered and the reading is still due.
 *
 * The gap between the two acts is real and short: their sentence is on the record
 * and the tool has not yet read the paper again with it. Saying nothing here
 * would leave the row empty, and saying "this paper expects nothing" would be the
 * old verdict arriving through the back door on a paper they have just placed.
 */
export const BEARING_READING_AGAIN_NOTE =
  "Abductive reads this paper again with your answer, and any expectations land on this row.";

/**
 * And what it says when that reading has landed and written nothing down.
 *
 * The honest outcome, and a common one: the researcher can place a paper in
 * their argument without the paper carrying a sentence about their setting that
 * their material could break. The prompt tells the model to ground every
 * expectation in the paper, so a paper with none produces none, and the row says
 * what happened rather than leaving the earlier sentence standing as if the
 * reading were still on its way.
 */
export const BEARING_READ_NOTHING_NOTE =
  "Abductive read this paper again with your answer and found the paper still silent on a setting like yours.";

/** The two controls, in the order they are offered. M83, ISC-700: "Add to
 * model" named no model the co-author could identify (2026-10-05); the expectation goes
 * to the researcher's ontology as a suggestion. */
export const ADD_LABEL = "Add to ontology";
export const DECLINE_LABEL = "Reject";

/**
 * Where an added expectation goes, said once per page above the papers on
 * Sources and in the Sources Help (M83, ISC-700; C6). The control is named and
 * Abductive acts, since a control does not act (L17).
 */
export const ADD_NOTE = `Press ${ADD_LABEL}, and Abductive sends the expectation to ${ONTOLOGY_TAB_LABEL} as a suggestion, where you accept or reject it.`;

/** What stands where the controls were, once an expectation is in the tray. */
export const ADDED_NOTE = "Added";

/**
 * One expectation, staged as a draft.
 *
 * The same shape the bulk control stages, deliberately: a researcher who adds
 * one from this row and a researcher who presses the button at the top of the
 * page get the same page in the tray with the same title and the same citation.
 * Two shapes would be two ideas of what a paper expects.
 */
export function baselineProposal(
  input: {
    readonly projectId: string;
    readonly paperKey: string;
    readonly baseline: PaperBaseline;
    readonly framingDigest: string;
    /** The model that wrote the expectation, from the `paper-fit` event. */
    readonly model?: string;
    readonly modelVersion?: string;
    /** M56: the lane beside the model. */
    readonly provider?: Provider;
    /** M60: the local server, beside provider "local". */
    readonly server?: string;
  },
  options: { readonly now?: () => number; readonly makeId?: () => string } = {},
): ProposalEvent {
  const now = options.now ?? (() => Date.now());
  const makeId = options.makeId ?? (() => crypto.randomUUID());
  const { baseline } = input;
  return {
    id: makeId(),
    ts: now(),
    /* The model that wrote the expectation, from the event that holds it. Same
     * reason the bulk staging carries it: a page a model composed has to name
     * the model, and this pass makes no call of its own to ask. */
    actor: "persona:reader",
    projectId: input.projectId,
    ...(input.model === undefined || input.modelVersion === undefined
      ? {}
      : { model: input.model, modelVersion: input.modelVersion, ...providerField(input) }),
    type: "proposal",
    proposalId: makeId(),
    pageType: "theory",
    title: baseline.expectation.trim(),
    body: [
      baselineScopeLine(baseline.scope),
      baseline.chunkId === undefined ? NO_SOURCE_FILE : `[[chunk:${baseline.chunkId}]]`,
    ].join("\n\n"),
    sourceChunks: baseline.chunkId === undefined ? [] : [baseline.chunkId],
    paperKey: input.paperKey,
    framingDigest: input.framingDigest,
    originOnAccept: "literature-derived",
  };
}

export function PaperExpectations(props: {
  projectId: string;
  /** The verdict on the record. Absent means nobody has judged this paper. */
  verdict?: PaperVerdict;
  /** Baseline ids the researcher has answered, and ones they turned down. */
  settled: SettledBaselines;
  /** Expectation titles already in the tray or the model, lowercased. */
  staged: ReadonlySet<string>;
  /** The framing the draft is stamped with. */
  framingDigest: string;
  /**
   * Whether the framing says enough to judge a paper against (M35).
   *
   * `canJudgeFit` over the study's context, computed by the caller. It decides
   * which of the two unjudged sentences is true, and it is passed rather than
   * derived here so this row and the section around it cannot disagree about
   * whether the researcher still has framing to fill in.
   */
  readonly judgeable: boolean;
  /**
   * What the researcher said this paper bears on, when they have said it
   * (M51, ISC-533).
   *
   * The sentence rather than a flag, because the empty case has three true
   * endings and the sentence is what separates two of them: compared against the
   * `bearing` the standing verdict carries, it says whether the reading their
   * answer bought has landed yet.
   */
  readonly said?: string;
  /** Called once something has been written, so the page can reread. */
  onChanged: () => void;
  /** Suffix for this row's test ids, so two rows do not collide. */
  testId: string;
}) {
  const {
    projectId,
    verdict,
    settled,
    staged,
    framingDigest,
    judgeable,
    said,
    onChanged,
    testId,
  } = props;
  const { appendAll } = useLedger();
  /* Which expectation's decline reasons are open, by id. One at a time, the
   * rule the study list and the Remove control already follow: two live
   * confirmations on one screen is how the wrong one gets confirmed. */
  const [declining, setDeclining] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = useCallback(
    async (baseline: PaperBaseline) => {
      if (busy !== null || verdict === undefined) return;
      setBusy(baseline.id);
      setError(null);
      try {
        await appendAll([
          baselineProposal({
            projectId,
            paperKey: verdict.paperKey,
            baseline,
            framingDigest,
            ...(verdict.model === undefined ? {} : { model: verdict.model }),
            ...(verdict.modelVersion === undefined
              ? {}
              : { modelVersion: verdict.modelVersion }),
            ...providerField(verdict),
          }) as LedgerEvent,
        ]);
        onChanged();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [appendAll, busy, framingDigest, onChanged, projectId, verdict],
  );

  const decline = useCallback(
    async (baseline: PaperBaseline, id: BaselineDeclineId) => {
      if (busy !== null || verdict === undefined) return;
      setBusy(baseline.id);
      setError(null);
      try {
        await appendAll([
          ...baselineDeclineEvents({
            projectId,
            baselineId: baseline.id,
            paperName: verdict.paperName,
            decline: id,
          }),
        ]);
        setDeclining(null);
        onChanged();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [appendAll, busy, onChanged, projectId, verdict],
  );

  /* Two ways a paper has not been asked what it expects, and one sentence for
   * both (M33 fix).
   *
   * No verdict at all is the first, and it is the state a fresh study is in.
   * The second is a verdict that predates the field: the walk found Bechky 2003
   * reading "fits your setting", with its reason, above "This paper expects
   * nothing about a setting like yours", which is the row reporting an absence
   * nobody had looked for. The paper is due for judging either way, so the
   * sentence that says what would fill it in is right for both.
   *
   * It used to draw nothing at all while a judgement was in flight, on the
   * reasoning that the chip beside the paper's name was already saying the tool
   * was working. That reasoning cost the whole feature (M33 fix 2). Judging
   * runs when the page opens now, so on a study whose verdicts all predate the
   * field every row is in flight from the moment it paints, and the section was
   * absent from the live page entirely: no sentence, no controls, nothing to
   * tell a researcher this existed. The earlier tests could not see it, because
   * with no model connected there was never a call to be in flight.
   *
   * So this says what the record says, whatever is in the air. The record is
   * true either way, and the chip beside the name is where "the tool is working
   * on it" belongs.
   *
   * Which of the two sentences it says depends on the framing (M35). See
   * `notJudgedNote`: telling a researcher with a complete framing to fill in
   * their framing sends them to a field that is already right. */
  const expectations = verdict?.baselines;
  if (verdict === undefined || expectations === undefined) {
    return (
      <p className="small muted" data-testid={`expects-unjudged-${testId}`}>
        {notJudgedNote({ judgeable })}
      </p>
    );
  }

  /* Read, and there was nothing to write down. Two ways that happens and they
   * are different states (M51, ISC-533). The researcher has answered the
   * question and the reading with their sentence in it has not landed yet, or
   * the tool read the paper as speaking to the setting and found no expectation
   * in it. A paper the tool could not place and nobody has spoken for reaches
   * neither: the row above it carries the question, and this section is not
   * drawn at all. */
  if (expectations.length === 0) {
    const sentence =
      said === undefined
        ? NOTHING_EXPECTED_NOTE
        : verdict.bearing === said
          ? BEARING_READ_NOTHING_NOTE
          : BEARING_READING_AGAIN_NOTE;
    return (
      <p className="small muted" data-testid={`expects-none-${testId}`}>
        {sentence}
      </p>
    );
  }

  return (
    <div className="paper-expects" data-testid={`expects-${testId}`}>
      <h4 className="paper-expects-head">{BASELINE_SECTION}</h4>
      <ul className="paper-expects-list">
        {expectations.map((baseline) => {
          const turnedDown = settled.declined.has(baseline.id);
          const inTray = staged.has(baseline.expectation.trim().toLowerCase());
          return (
            <li key={baseline.id} data-testid={`expects-${testId}-${baseline.id}`}>
              <p className="paper-expects-claim">{baseline.expectation}</p>
              <p className="small muted paper-expects-scope">
                {baselineScopeLine(baseline.scope)}
              </p>
              {turnedDown ? (
                /* The record's own words, which are what the refusal carries.
                   The expectation stays on the row: the paper still holds it,
                   and what changed is what the researcher said about it. */
                <p className="small muted" data-testid={`expects-declined-${baseline.id}`}>
                  {settled.declined.get(baseline.id) ?? ""}
                </p>
              ) : (
                <div className="btnrow paper-expects-do">
                  {inTray ? (
                    <StatusChip label={ADDED_NOTE} testId={`expects-added-${baseline.id}`} />
                  ) : (
                    <button
                      type="button"
                      className="btn"
                      disabled={busy !== null}
                      data-testid={`expects-add-${baseline.id}`}
                      onClick={() => void add(baseline)}
                    >
                      {ADD_LABEL}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-quiet"
                    disabled={busy !== null}
                    data-testid={`expects-decline-${baseline.id}`}
                    onClick={() => setDeclining(declining === baseline.id ? null : baseline.id)}
                  >
                    {DECLINE_LABEL}
                  </button>
                </div>
              )}
              {/* The three reasons, opened by the control above rather than
                  standing beside it. Which one the researcher picks is the
                  measurement: saying the paper does not hold this is a decision
                  about the paper, saying it does not apply is a decision about
                  the boundary of the study, and "not yet" is neither. */}
              {declining === baseline.id && !turnedDown && (
                <ul
                  className="paper-expects-reasons"
                  data-testid={`expects-reasons-${baseline.id}`}
                >
                  {BASELINE_DECLINES.map((option) => (
                    <li key={option.id}>
                      <button
                        type="button"
                        className="linkish"
                        disabled={busy !== null}
                        data-testid={`expects-decline-${baseline.id}-${option.id}`}
                        onClick={() => void decline(baseline, option.id)}
                      >
                        {option.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {error !== null && (
        <p className="error small" role="alert" data-testid={`expects-error-${testId}`}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The heading over expectations an older project holds for a paper named by its
 * citation alone (M78a, ISC-678). The model wrote them from its memory of the
 * citation, so they stay readable here, with no controls, and count for nothing
 * in Checks.
 */
export const CITATION_ONLY_HEAD = "Written from the citation alone";

export function CitationOnlyExpectations(props: { verdict: PaperVerdict; testId: string }) {
  const expectations = props.verdict.baselines ?? [];
  if (expectations.length === 0) return null;
  return (
    <div className="paper-expects" data-testid={`expects-citation-${props.testId}`}>
      <h4 className="paper-expects-head">{CITATION_ONLY_HEAD}</h4>
      <ul className="paper-expects-list">
        {expectations.map((baseline) => (
          <li key={baseline.id}>
            <p className="paper-expects-claim">{baseline.expectation}</p>
            <p className="small muted paper-expects-scope">{baselineScopeLine(baseline.scope)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
