/**
 * The papers you are arguing with (ISC-296 … ISC-299, D5).
 *
 * A co-author's ask on 4 August: let the researcher say "I really want to
 * contribute to this stream, and here are the five core papers I'm in
 * conversation with." Their reason was that naming it is useful to the
 * researcher before it is useful to the tool. A lot of qualitative work goes
 * wrong because nobody made the author say which conversation they were
 * joining until the data was already collected.
 *
 * Pasted or uploaded, never searched for from in here. Abductive promises that
 * nothing but a model call leaves the browser, and wiring OpenAlex into this
 * page would quietly make that false. The separate scholarly-ideas tool does
 * the searching; its output pastes in here.
 *
 * Deliberately one free-text field rather than a structured citation list.
 * A form with authors, years and venues would imply the tool does something
 * with the structure, and it does not: this text goes into the prompt so the
 * interviewer and the coherence checks can see what the researcher thinks they
 * are contributing to. A field that promises more than it delivers is the
 * thing this codebase keeps having to unpick.
 *
 * What D5 adds is the files. The typed list had no upload path, so the papers
 * went where the only picker was, which was the one whose kind select defaulted
 * to `transcript`. The rendered page showed `thorp.pdf TRANSCRIPT`: the tool
 * whose central promise is attribution had filed a journal editorial as
 * fieldwork, and `uncited-chunk` then nagged the researcher for not citing it
 * as evidence. The picker here writes kind `literature` and has no select to
 * get wrong.
 *
 * The typed list and the Framing band on the Design page are the same field,
 * `brief.seminalCorpus`, saved the same way. Two surfaces, one string, because
 * the names of the papers belong beside the puzzle and the files belong beside
 * the material.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  getProject,
  saveChunks,
  saveDocument,
  updateBrief,
  type Project,
} from "../state/projects.ts";
import { ingestFile, isPdfFile, type Chunk, type StoredDocument } from "../state/chunks.ts";
import {
  Disclosure,
  Field,
  InertNote,
  Row,
  StatusChip,
  fieldAria,
  inertAttrs,
} from "../ui/components/index.ts";
import {
  expectationsFrom,
  extractTheoryClaims,
  papersAlreadyRead,
  papersToRead,
  paperRefs,
} from "../proposals/theory.ts";
import {
  baselinesSettled,
  paperBaselines,
  papersFullyStaged,
} from "../proposals/baselines.ts";
import { projectProposals } from "../proposals/projection.ts";
import { ADD_NOTE, CitationOnlyExpectations, PaperExpectations } from "./PaperExpectations.tsx";
import { judgingAvailable, useJudgeOnMount, usePaperFit } from "./usePaperFit.ts";
import { PaperFitChip } from "./PaperFitChip.tsx";
import { RemoveDocument } from "./RemoveDocument.tsx";
import {
  citationKey,
  framingDigest,
  papersNeedingJudgement,
  paperVerdicts,
} from "../proposals/paperFit.ts";
import { bestNamedDocument, readsAsCitation } from "../proposals/theory.ts";
import { useLedger } from "../state/ledgerContext.tsx";
import {
  bearingReasons,
  paperBearings,
  paperStanding,
  showsJudgeSentence,
  type PaperStanding,
} from "../views/paperBearings.ts";
import type { PaperVerdict } from "../proposals/paperFit.ts";
import { PaperBearing } from "./PaperBearing.tsx";
import { canJudgeFit, studyContext } from "../interview/studyContext.ts";

/** The id the Framing band's "Upload the papers" link scrolls to. */
export const LITERATURE_SECTION_ID = "literature";

/**
 * What the reading is waiting on; null once it is live (M29, R12).
 *
 * A condition rather than an instruction, like every other sentence under an
 * inert control in this codebase. There is nothing to read until a paper has
 * been named or dropped, and the sentence says which.
 */
/** What a paper's row says when the file yielded nothing to read. */
export const UNREADABLE_NOTE =
  "Abductive couldn't find readable text in the file, which may be a scan.";

/**
 * What a paper's row is doing, when it is not showing a verdict (walk item 3).
 *
 * The order is the order it happens in. A row with no passages while an upload
 * is running is still being read; one with no passages after that is a file
 * nothing came out of; one being judged says so; and one nobody has judged says
 * that, because silence there reads as approval.
 */
export function paperRowState(input: {
  readonly passages: number;
  readonly uploading: boolean;
  readonly judging: boolean;
}): "reading" | "unreadable" | "judging" | "unjudged" {
  if (input.passages === 0) return input.uploading ? "reading" : "unreadable";
  return input.judging ? "judging" : "unjudged";
}

/**
 * What a typed line with no file behind it says (M78a, ISC-678). The walk's six
 * citations read READ, with expectations the model wrote from memory; a paper
 * is read only once its text is here.
 */
export const NAMED_NOTE = "Identified at Starting point; upload the paper and Abductive considers it.";

export function readPapersReason(papers: number, unread: number = papers, named: number = 0): string | null {
  if (papers === 0) {
    /* M78a: the papers named only by their citation have nothing to read yet. */
    return named > 0 ? "Upload a paper, and Abductive considers it for its expectations." : "Identify or upload a paper first.";
  }
  /* Walk finding. Every paper has been read against the framing you have now,
   * so there is nothing a second press would buy. It goes live again when the
   * framing moves, or when a paper arrives. */
  return unread === 0
    ? "Add a paper to get more suggestions."
    : null;
}

/**
 * What the button says, and why it says "every" (D20, M43b).
 *
 * It said "Draft what these papers expect", and the walk of 2026-09-13 pressed
 * it for the one paper that showed no expectations, on the reading that it would
 * read that paper. One press staged all seven expectations of all four papers
 * that had any, removed the accept and turn-down controls from every row, and did
 * nothing at all for the paper it was pressed for. Two of the seven were ones the
 * researcher had reasoned their way to turning down, and the row where they would
 * have turned them down was gone.
 *
 * The control is not changed: staging every expectation is what it is for, and
 * removing the row controls afterwards is correct, because an expectation already
 * in the drafts is not one to accept or turn down at the row. What was wrong is
 * that nothing on the control said so. So the label says whose expectations and
 * how many papers, in the imperative, and the line under it says the row controls
 * go and where the deciding happens.
 *
 * One label in both states. The second one was "Read the papers again", which
 * described a model call this control has not made since M33 and appeared only on
 * the inert form, where the reason beside it already says what would wake it.
 */
export const READ_PAPERS_LABEL = "Suggest expectations";

export function readPapersLabel(unread: number, papers: number): string {
  void unread;
  void papers;
  return READ_PAPERS_LABEL;
}

/** The sentence under it, which says what the press does. */
export function readPapersScope(unread: number, papers: number): string {
  if (papers > 0 && unread === 0) {
    return "Every paper's expectations are already in your suggestions.";
  }
  /* M33. The old sentence described a model call this control no longer makes,
   * and ended "One call per paper", which is now false: the papers were read
   * when they arrived, and this puts what they expect in front of the
   * researcher. Changed on the team lead's authorisation, because a control
   * that misdescribes what it costs is worse than a string nobody edited.
   *
   * D20 (M43b). It still read "to accept or turn down", which a researcher takes
   * as the controls on each row staying where they are. They go, and the walk
   * read that as the press having performed the accept for them. */
  return "One press adds one to three expectations per paper to your suggestions on the Emerging project ontology tab, and the buttons on each paper's row go away.";
}

/**
 * What the panel says when the judge threw (M35).
 *
 * `judgeArrivals` used to toggle a flag and nothing else, and both call sites
 * threw the failure away. So a bridge that answered its health probe and then
 * failed the model call left the row reading "Not judged yet", with no retry
 * and nothing to say why, which is exactly what a paper nobody had judged
 * looked like. The walk spent eight minutes unable to tell those apart.
 *
 * The paper by name when one was due, because that is the row the researcher is
 * looking at. With several due it names the papers rather than picking one, and
 * the message the tool got comes after either way: it is the only part that
 * says what to do next.
 */
export function judgeFailureNote(paperName: string | null): string {
  const what = paperName === null ? "your papers" : paperName;
  /* M78a, ISC-678 (L9): what failed, then what to do. The walk read "Abductive
   * couldn't read your papers: AbortError", an exception's name. */
  return `Abductive couldn't consider ${what}. Try again.`;
}

/**
 * Abductive's placing of a paper, for the relate line (M78b, ISC-681): the
 * judge's own sentence about the paper and the setting, on a paper that
 * Abductive placed. A paper still asked about, or never read, has none.
 */
export function placingOf(standing: PaperStanding, verdict: PaperVerdict | undefined): string | undefined {
  if (standing !== "placed" || verdict === undefined) return undefined;
  const said = verdict.reason.trim();
  return said === "" ? undefined : said;
}

export function SeminalCorpus(props: {
  projectId: string;
  /** The literature documents already in storage. Never the data. */
  documents: readonly StoredDocument[];
  /** Their passages, for the count under each row. */
  chunks: readonly Chunk[];
  /** Called once a paper has landed in storage, so the page can reread it. */
  onAdded: () => void;
  /**
   * The titles already in the model, so reading the papers twice does not draft
   * the same expectation twice.
   *
   * The titles rather than the graph, deliberately. This section does not draw
   * the model and must not start: the one surface that hands a raw graph around
   * is the one that exported prose the screen disagreed with, and a list of
   * strings cannot be rendered by accident.
   */
  existingTitles?: readonly string[];
}) {
  const { projectId, documents, chunks, onAdded, existingTitles } = props;
  const { appendAll, events } = useLedger();
  const judgeFit = usePaperFit(projectId);
  const [reading, setReading] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const readingRef = useRef(false);
  const [project, setProject] = useState<Project | undefined>(undefined);
  const [draft, setDraft] = useState("");
  /* Initialised true, which was harmless while the label lived inside a dead
   * button and is not now: the chip read "Saved" on first paint, before
   * anything had been saved and before the field had even loaded. Nothing was
   * saved, so the report says so. */
  const [saved, setSaved] = useState(false);
  /* Every verdict on the record, so a row and a typed line read the same one.
   * Two derivations of the same fact is how a paper came to be a misfit on one
   * surface and unmarked on another. */
  const verdicts = useMemo(
    () =>
      paperVerdicts(
        events,
        projectId,
        /* Only what the study still names (team-lead walk, item a). An edited
         * typed line keeps its old verdict on the record and must stop being
         * counted the moment the line it judged is gone. */
        new Set(
          paperRefs({
            documents,
            chunks,
            ...(project?.brief.seminalCorpus === undefined
              ? {}
              : { typedList: project.brief.seminalCorpus }),
          }).map((paper) => paper.key),
        ),
      ),
    [events, projectId, documents, chunks, project],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* M78a: whether the error is a failed reading, which the Try again control repeats. */
  const [readFailed, setReadFailed] = useState(false);
  /* Which paper's Remove has been armed, by id. One at a time, as on the study
   * list: two live confirmations on one screen is how the wrong one gets
   * confirmed. */
  const [arming, setArming] = useState<string | null>(null);
  /* Whether a fit judgement is running (walk item 3). A paper's row said
   * nothing at all for twenty seconds after it was uploaded, so a researcher
   * watching it had no way to tell a slow call from a broken one. */
  const [judging, setJudging] = useState(false);

  /* Reloaded whenever the page rereads, not once at mount (walk finding).
   *
   * It loaded the project when this section mounted and never again, so the
   * copy it held aged for as long as the tab stayed on Material: a framing
   * saved on Design, or in another tab, was invisible here, and the field kept
   * showing what the list said when the tab opened. `documents` changes on
   * every reread, which is the signal this page already has for "go and look
   * again". The box is left alone while the researcher is editing it: their
   * unsaved text is not something an incoming load may throw away. */
  useEffect(() => {
    let cancelled = false;
    void getProject(projectId).then((p) => {
      if (cancelled || p === undefined) return;
      setProject(p);
      setDraft((current) => (dirtyRef.current ? current : (p.brief.seminalCorpus ?? "")));
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, documents, chunks]);

  async function save() {
    if (project === undefined) return;
    /* One field, merged onto what is on disk now.
     *
     * It wrote `{ ...project, brief: { ...project.brief, seminalCorpus } }`,
     * where `project` was loaded when this section mounted and never resynced.
     * So saving the papers list rolled every other field of the brief back to
     * whatever it held at that mount: a venue typed on Design after this tab
     * loaded went back to empty, with no error and nothing on screen to say it
     * had happened. */
    const written = await updateBrief(projectId, { seminalCorpus: draft });
    if (written === undefined) return;
    const next = { ...project, brief: written.after };
    setProject(next);
    setSaved(true);
    /* Judge whatever line is new (M29c). The diff is inside the hook, so a
     * researcher who fixes a typo in line two pays for nothing and one who adds
     * a sixth line pays for one paper. A failed call must not take the save
     * with it: the list is theirs and the verdict is the tool's opinion of it.
     * `judgeArrivals` holds its own failure and puts it on the panel now (M35),
     * so the catch that used to sit here would only hide the next one. */
    await judgeArrivals(next.brief);
  }

  /**
   * What a saved answer about a paper sets off (M51, ISC-533).
   *
   * The page rereads, as it does after any write, and then the judge runs: the
   * researcher has just told the tool what the paper bears on, and the point of
   * the answer is the reading it buys. Waiting for the next mount would leave
   * their sentence on the row with nothing coming of it until they navigated
   * away and back.
   *
   * It costs one call and only one: `papersNeedingJudgement` compares the
   * sentence on the record against the sentence the standing verdict was told,
   * so a second press with nothing new to say is free.
   */
  const bearingSaved = async (): Promise<void> => {
    onAdded();
    if (project === undefined) return;
    await judgeArrivals(project.brief);
  };

  /** Judge on arrival, from whichever of this file's two controls added it. */
  const judgeArrivals = async (brief: Project["brief"]): Promise<void> => {
    /* Nothing connected, nothing to wait for (M33 fix). The chip this flag
     * draws says the tool is working out whether the paper fits, and the row
     * holds back what it would otherwise say until it comes back. With no model
     * it was never coming back. */
    if (!judgingAvailable()) return;
    /* Which paper a failure would name (M35). The same diff the judge runs, so
     * the message is about the paper the researcher is watching rather than
     * about the list. Read before the call, because afterwards the record has
     * moved and nothing is due any more. */
    const due = papersNeedingJudgement({
      papers: paperRefs({
        documents,
        chunks,
        ...(brief.seminalCorpus === undefined ? {} : { typedList: brief.seminalCorpus }),
      }),
      verdicts,
      digest: framingDigest(studyContext(brief)),
      /* M51, ISC-533. The same fourth reason the judge itself counts, so the
         sentence this list feeds names the paper the researcher is watching.
         Without it a re-read bought by their own answer would be reported as a
         failure about no paper in particular. */
      bearings: bearingReasons(events, projectId),
    });
    setJudging(true);
    setError(null);
    setReadFailed(false);
    try {
      const written = await judgeFit({ brief });
      if (written > 0) onAdded();
    } catch {
      /* Said, rather than swallowed (M35). A throw here used to leave the row
       * reading "Not judged yet" with no retry and nothing to say why, which is
       * what an unjudged paper looks like anyway. It goes where an upload that
       * failed already goes, because that is the one place on this panel a
       * researcher already looks when something did not work. */
      setError(judgeFailureNote(due.length === 1 ? (due[0]?.name ?? null) : null));
      setReadFailed(true);
    } finally {
      setJudging(false);
    }
  };

  /* Judge whatever is due when this page opens (M33 fix).
   *
   * The walk found Bechky 2003 reading "fits your setting" above "This paper
   * expects nothing about a setting like yours". Its verdict predated the
   * expectations field, so it was current about fit and had never been asked
   * what the paper expects, and nothing on the page could ask: judging ran only
   * when a paper arrived or the framing was saved. It costs no model call when
   * every paper is current. */
  useJudgeOnMount(projectId, project !== undefined, async () => {
    if (project === undefined) return;
    await judgeArrivals(project.brief);
  });

  const dirty = project !== undefined && draft !== (project.brief.seminalCorpus ?? "");
  /* Readable from inside the loader without making the loader depend on it. */
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const passagesByDoc = useMemo(() => {
    const counts = new Map<string, number>();
    for (const chunk of chunks) counts.set(chunk.documentId, (counts.get(chunk.documentId) ?? 0) + 1);
    return counts;
  }, [chunks]);

  /*
   * No kind select, and that is the point of the control rather than an
   * omission. Everything dropped here is a paper, so there is nothing to
   * choose and nothing to get wrong. The one defect this section exists to fix
   * was a default on a select exactly like the one that is not here.
   */
  const onUpload = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files === null || files.length === 0) return;
      setBusy("Adding files…");
      setError(null);
      const chosen = Array.from(files);
      try {
        let count = documents.length;
        for (const file of chosen) {
          let extractPdf: ((f: File) => Promise<string>) | undefined;
          if (isPdfFile(file.name)) {
            const pdf = await import("../state/pdf.ts");
            extractPdf = pdf.extractPdfText;
          }
          const result = await ingestFile({
            projectId,
            file,
            kind: "literature",
            existingDocumentCount: count,
            ...(extractPdf !== undefined ? { extractPdf } : {}),
          });
          await saveDocument(result.document);
          await saveChunks(result.chunks);
          count += 1;
          // Per file, not once after the loop. Same defect and same fix as
          // CorpusMaterial.onUpload: a throw part way through a batch used to
          // leave every paper that had already landed invisible until a reload.
          onAdded();
        }
        /* Once, after the batch (M29c). Per file would be one model call each
         * inside a loop the researcher is watching, and the papers are judged
         * against the same study whichever order they landed in. */
        if (project !== undefined) await judgeArrivals(project.brief);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
        e.target.value = "";
      }
    },
    [documents.length, projectId, onAdded],
  );

  /*
   * The papers, read for what they expect (M29, R12).
   *
   * The typed list comes off the saved project rather than off the draft in the
   * textarea, so the reading is over what the researcher has committed to and
   * not over half a line they are still typing. The count of papers is
   * `papersToRead`, which is the same function that decides how many calls are
   * about to be spent, so the number under the button is the number it spends.
   */
  const named = useMemo(
    () =>
      papersToRead({
        documents,
        chunks,
        ...(project?.brief.seminalCorpus === undefined
          ? {}
          : { typedList: project.brief.seminalCorpus }),
      }),
    [documents, chunks, project],
  );
  /* M78a, ISC-678: only a paper with text is read, so only those count here. */
  const papers = useMemo(() => named.filter((paper) => paper.documentId !== undefined), [named]);
  const namedOnly = named.length - papers.length;

  /*
   * What each paper has already produced, and which of them are worth a call
   * (walk finding).
   *
   * Pressing the button twice read the same three papers twice and staged eight
   * expectations. The guard was a list of titles already in the model, which
   * cannot work: a model asked the same question twice does not answer in the
   * same words, so every second reading looked new.
   *
   * A paper is read once against a framing. If the framing moves, the paper is
   * worth reading again, because what the reader was given has changed and so
   * will what it says. If it has not, a second press spends nothing.
   */
  /* The study as every generator sees it, assembled once (M35). The digest and
   * the answer to "can a paper be judged against this yet" both come off it, and
   * two readings of the brief is two chances for the page to disagree with
   * itself about the same framing. */
  const context = useMemo(
    () => (project === undefined ? undefined : studyContext(project.brief)),
    [project],
  );
  const digest = useMemo(() => (context === undefined ? "" : framingDigest(context)), [context]);
  /* Whether the framing says enough to judge a paper at all. It decides which
   * sentence an unjudged row shows, and the rows are told rather than left to
   * work it out. */
  const judgeable = context !== undefined && canJudgeFit(context);
  /* What the researcher has already done with each expectation (M33). Off the
   * record for the same reason: a decline made here and an answer given in the
   * interview both land in the ledger, and a row holding its own idea of what
   * had been settled would disagree with the check that counts them. */
  const settled = useMemo(() => baselinesSettled(events, projectId), [events, projectId]);
  /* Expectations already waiting in the tray or taken into the model, so a row
   * does not offer to stage one twice. Titles, because that is what a baseline
   * stages as and what the near-duplicate check compares. */
  const stagedTitles = useMemo(() => {
    const tray = projectProposals(events, projectId);
    return new Set(
      [...tray.pending, ...tray.accepted].map((p) => p.title.trim().toLowerCase()),
    );
  }, [events, projectId]);
  const readCounts = useMemo(() => papersAlreadyRead(events, projectId), [events, projectId]);
  /* Which papers have nothing left to stage (M33).
   *
   * `papersToSkip` counted any draft from a paper as having read it, which was
   * right while a press cost a model call and produced whatever it produced.
   * Adding one expectation from its own row would now put the whole paper
   * behind that guard, so the other two became reachable one click at a time
   * and the button told the researcher to change their framing. What counts is
   * whether any expectation is left: still true, still framing-sensitive,
   * because a framing change re-judges the paper and a new expectation is a new
   * title nothing has staged. */
  const skip = useMemo(
    () =>
      papersFullyStaged({
        baselines: paperBaselines(events, projectId),
        declined: settled.declined,
        staged: stagedTitles,
      }),
    [events, projectId, settled, stagedTitles],
  );
  const unread = useMemo(
    /* Keyed the way the record keys it (M33). It compared the raw typed line
     * against a set of `paperKey`s, which for a typed paper is the first author
     * and the year, so a typed line was never recognised as already staged: the
     * count under the button never fell and the control never reached its
     * second state. `citationKey` is the one definition of that key. */
    () => papers.filter((paper) => !skip.has(paper.documentId ?? citationKey(paper.name))),
    [papers, skip],
  );
  /* What the read control says, once, so the button and the sentence that sends
   * a reader to it cannot come to say different things (M35). */
  const readLabel = readPapersLabel(unread.length, papers.length);

  /* M89: the open paper notices, read off the checks' flags (M29b, M51), went
   * with the checks; each paper's row asks its own question (`paperStanding`). */

  /* What the researcher has said each paper bears on (M51, ISC-533), off the
   * same record. A row draws the question or their own sentence from this and
   * from the verdict, through `paperStanding`, so the row on Material and the
   * companion panel on Design cannot disagree about which of the two a paper is
   * showing. */
  const bearings = useMemo(() => paperBearings(events, projectId), [events, projectId]);


  /* Misfits with no row of their own (M29b).
   *
   * A finding is keyed by the document for an upload and by the typed line for
   * one that was never uploaded, and only the uploads have a row. So a typed
   * paper counted toward "2 papers do not fit" and then had nowhere to say
   * which one or why, which is a count the researcher cannot act on. These get
   * their own short list under the field they were typed into. */
  /* Every typed line, with its verdict when it has one (M29c).
   *
   * It listed only the misfits, so a researcher who typed four lines and saw
   * one notice could not tell whether the other three had been judged and
   * passed or had never been read. Every line that has been judged now says so
   * beside itself; a line with no verdict draws no chip, which is the state
   * that used to be indistinguishable from approval. */
  const typedLines = useMemo(() => {
    /*
     * One row per line, and the row's name is the line (walk item 4 addendum).
     *
     * The walk saw a row reading "Grodal and Schildt 2026, Abductive
     * qualitative research with LLMsd Safety in Health Care)": the start of one
     * line with the tail of another spliced onto it. Split on either line
     * ending, trim, drop the blanks, and carry the trimmed line itself as the
     * name, so nothing downstream can index into the joined text.
     *
     * The key is the position rather than the text. Two lines can be the same
     * string while the researcher is editing one into the other, and a repeated
     * key is how React comes to reuse the wrong row.
     */
    return (project?.brief.seminalCorpus ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "")
      /* M74b, ISC-664 (option B): a row for a citation line only; a line of
       * prose names literatures and is no paper. */
      .filter((line) => readsAsCitation(line))
      .map((line, index) => {
        /*
         * Every line, including the ones with a file behind them.
         *
         * They were filtered out, on the rule that a paper is named once, and
         * the owner reversed that after checking it live: keeping the line
         * visible is what tells the reader the tool has matched their line to
         * their file, and hiding it made them look lost. The file keeps its own
         * row above with its passage count; this row is about the line, and it
         * says which file answers to it and carries that file's verdict.
         *
         * `papersToRead` still excludes the duplicate, and that is the
         * exclusion that costs something: it is what stops the reader spending
         * a second call on one paper.
         *
         * Keyed on the document when there is one, because that is the key its
         * verdict was written under, and on the citation otherwise (walk item
         * 4): looking it up by the whole line meant rewriting a title lost the
         * verdict and the row went quiet, which on this page reads as approval.
         */
        const named = bestNamedDocument(line, documents);
        const key = named?.id ?? citationKey(line);
        return {
          line,
          index,
          key,
          /* The whole verdict, for the expectations section (M33). The field
             beside it is the verdict word, which is what the chip needs. */
          fit: verdicts.get(key),
          uploaded: named?.name,
          verdict: verdicts.get(key)?.verdict,
          reason: verdicts.get(key)?.reason ?? "",
          drafts: readCounts.get(key)?.drafts ?? 0,
          /* Where this paper stands with the researcher (M51, ISC-533): still
             being asked about, answered, placed by the tool, or unread. */
          standing: paperStanding({
            ...(verdicts.get(key) === undefined ? {} : { verdict: verdicts.get(key)! }),
            ...(bearings.get(key) === undefined ? {} : { bearing: bearings.get(key)! }),
          }),
          bearing: bearings.get(key),
        };
      });
  }, [documents, project, verdicts, readCounts, bearings]);

  const readPapers = useCallback(async () => {
    if (readingRef.current || unread.length === 0) return;
    readingRef.current = true;
    setReading("Considering your papers…");
    setReadError(null);
    try {
      /* M33. This control keeps its label, its place and its sentences, and it
       * no longer spends a model call. The papers were read when they arrived,
       * and what each one expects was written down then; pressing this stages
       * those expectations as drafts in the tray, minus the ones the researcher
       * has turned down. One derivation instead of two, and a second press can
       * no longer produce a differently-worded copy of the same expectation,
       * which is what it used to do. See the module note in `theory.ts`. */
      const result = extractTheoryClaims({
        projectId,
        documents,
        chunks,
        ...(project?.brief.seminalCorpus === undefined
          ? {}
          : { typedList: project.brief.seminalCorpus }),
        ...(existingTitles === undefined ? {} : { existingTitles }),
        /* The papers already staged against this framing. Skipped here rather
           than filtered afterwards, so the count under the button and the
           papers it acts on come from one place. */
        skip,
        /* What the papers expect, and what the researcher has already said no
         * to. Both off the same record every other surface reads. */
        verdicts,
        declined: baselinesSettled(events, projectId).declined,
        framingDigest: digest,
      });
      await appendAll(result.events);
      onAdded();
    } catch (err) {
      setReadError(err instanceof Error ? err.message : String(err));
    } finally {
      setReading(null);
      readingRef.current = false;
    }
  }, [
    unread.length,
    skip,
    projectId,
    documents,
    chunks,
    project,
    existingTitles,
    appendAll,
    onAdded,
    verdicts,
    events,
    digest,
  ]);

  /* M83, ISC-700: whether any paper row below draws Add to ontology, which is
   * when the sentence about it belongs on the page. The row draws the control
   * for a verdict with expectations, unless the paper is still asking about its
   * bearing (see the row below) or every expectation is already settled. */
  const offersAdd = documents.some((doc) => {
    const judged = verdicts.get(doc.id);
    const bearing = bearings.get(doc.id);
    const standing = paperStanding({
      ...(judged === undefined ? {} : { verdict: judged }),
      ...(bearing === undefined ? {} : { bearing }),
    });
    return standing !== "asking" && (judged?.baselines ?? []).some((b) => !settled.declined.has(b.id));
  });

  return (
    <section className="corpus-lit" id={LITERATURE_SECTION_ID} data-testid="seminal-corpus">
      {/* R3 item 6 and copy C8. "Not your evidence" moves into the heading,
          where the confusion actually happens, which deletes the sentence that
          used to carry it. */}
      <h2>Papers</h2>
      {/* M49, ISC-529, string only: the last clause pointed at a section that is
          no longer on the page. Material is the papers until the researcher says
          they have data, so the sentence names the control that opens the data
          section rather than a heading below this one. */}
      {/* M62, ISC-600: held on the page. This sentence glosses "expectations" where a reader
          first meets the term, which the copy standard's Part 5 (M61, ISC-585) requires
          on the page; moving it into the Help panel is returned to the lead. */}
      <p className="studyview-lede" data-testid="papers-join-literatures">
        Papers that you add on Sources join the literatures that you identified at Starting point.
        Identify the papers that you expect to draw on.
        Abductive considers each paper for its expectations (what the paper leads readers to expect) and to see which conversation
        you're joining. Your evidence is your own data, which you add once you
        say you have some.
      </p>

      <Field
        label="Paper list"
        htmlFor="seminal-corpus-input"
        hint="Write one paper per line, with an author and a year."
      >
        <textarea
          id="seminal-corpus-input"
          rows={6}
          value={draft}
          data-testid="seminal-corpus-input"
          placeholder={"Zuckerman 2017 on genres and puzzles\nLangley 1999 on process theorising\n…"}
          onChange={(e) => {
            setDraft(e.target.value);
            setSaved(false);
          }}
          {...fieldAria("seminal-corpus-input", { hint: true })}
        />
      </Field>
      {/* M29b. Under the list they were typed into, because that is the text
          the researcher edits to answer the finding. Each carries the reader's
          own sentence: a notice saying only that a paper does not fit is one
          nobody can act on or argue with. */}
      {typedLines.length > 0 && (
        <ul className="corpus-typed-misfits" data-testid="typed-misfits">
          {typedLines.map((l) => (
            <li key={l.index} data-testid={`typed-line-${l.index}`}>
              <span className="corpus-doc-name">{l.line}</span>{" "}
              {/* Walk item 4: every line, with its state. A line the tool had
                  not judged rendered nothing at all, so "not judged" and
                  "judged and quiet" looked the same on screen. */}
              {/* M78a, ISC-678: a line with no file behind it is Named, not read. */}
              <PaperFitChip
                verdict={l.verdict}
                state={l.uploaded === undefined ? "named" : judging ? "judging" : "unjudged"}
              />
              {l.uploaded !== undefined && l.drafts > 0 && <StatusChip label={expectationsFrom(l.drafts)} />}
              {/* Which file answers to this line, so a reader meeting the same
                  paper twice on one page knows the tool has matched them. */}
              {l.uploaded !== undefined && (
                <StatusChip label={`uploaded as ${l.uploaded}`} testId={`typed-upload-${l.index}`} />
              )}
              {/* The sentence sits on one row, and it is the file's row when
                  there is a file (owner's report). Both rows key on the same
                  document, so both printed the same verdict's reason and the
                  paper read as having been judged twice. The line keeps the
                  chips, which is what says the tool has matched it and what it
                  found; the reason goes where the passage count is, because
                  that is the row a reader acts on. */}
              {/* M51, ISC-533. The judge's own sentence, on a paper it placed
                  and nowhere else. On a paper it could not place the same
                  sentence was the dismissal ("makes no prediction about a
                  setting like yours"), and what stands there now is the
                  question below. */}
              {l.uploaded === undefined && (
                <p className="small muted" data-testid={`typed-named-${l.index}`}>
                  {NAMED_NOTE}
                </p>
              )}
              {/* M33. What the line's paper expects, on the line itself when
                  no file answers to it. This is the case that matters most:
                  the expectation comes from a model's memory of a citation
                  rather than from a file anyone read, and the researcher is
                  the only one who can catch a fabrication. When a file does
                  answer to the line, the section is on the file's row below,
                  because that is the row a reader acts on and both rows key
                  on the same document. */}
              {l.uploaded === undefined && (
                <>
                  {/* M78b, ISC-681: the question under every paper, prefilled
                      with Abductive's placing when it has one. Until M78b only a
                      paper that Abductive couldn't place carried it (M51). */}
                  <PaperBearing
                    projectId={projectId}
                    paperKey={l.key}
                    paperName={l.line}
                    {...(l.bearing === undefined ? {} : { bearing: l.bearing })}
                    /* M78a, ISC-678: a typed line is Named, with no reading until a
                       text is uploaded, so its line opens without a placing. */
                    onSaved={() => void bearingSaved()}
                    testId={`line-${l.index}`}
                  />
                  {/* M78a, ISC-678: an older project's expectations for a
                      named paper, readable under their own label, with no
                      controls; they count for nothing in Checks. */}
                  {l.fit !== undefined && <CitationOnlyExpectations verdict={l.fit} testId={`line-${l.index}`} />}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Same correction as the station actions: "Saved" and "No changes" are
          reports, not controls, and drawing them as a dead button put a third
          unexplained grey slab on /material. The button exists when there is
          something to press. */}
      <div className="btnrow">
        {dirty ? (
          <button type="button" onClick={() => void save()} data-testid="save-corpus">
            Save
          </button>
        ) : (
          /* Three states, not two, the way the step column already does it
             (M29b). "Nothing to save yet" printed beside a field holding a
             saved paper, because the only distinction drawn was whether this
             session had typed anything. What a researcher wants to know is
             whether what is on screen is what is on the record. */
          <StatusChip
            label={saved ? "Saved" : draft.trim() === "" ? "Empty" : "Saved"}
            tone={saved ? "ok" : "neutral"}
          />
        )}
      </div>

      <div className="material-add" data-testid="literature-add">
        <Field
          label="Add papers"
          htmlFor="literature-upload"
          hint={`${documents.length} loaded. pdf, txt or md. Files stay in this browser.`}
        >
          <input
            id="literature-upload"
            type="file"
            multiple
            accept=".pdf,.txt,.md"
            onChange={(e) => void onUpload(e)}
            data-testid="literature-upload"
            {...fieldAria("literature-upload", { hint: true })}
          />
        </Field>
        {busy !== null && (
          <p className="small muted" role="status" data-testid="literature-busy">
            {busy}
          </p>
        )}
        {error !== null && (
          <p className="error small" role="alert" data-testid="literature-error">
            {error}
          </p>
        )}
        {error !== null && readFailed && project !== undefined && (
          <button
            type="button"
            className="btn"
            onClick={() => void judgeArrivals(project.brief)}
            data-testid="literature-retry"
          >
            Try again
          </button>
        )}
        {/* R3 item 6. Six sentences stood around this one control. What is
            left beside it is the one a reader has to have; the rest is a fold. */}
        {/* M62, ISC-600: The papers fold moved into the page's Help control (ui/pageHelp.ts). */}
      </div>

      {/* M29, R12. The one thing on this page that spends a model call, so it
          sits with the papers it reads and says what it is about to do. */}
      <div className="literature-read" data-testid="literature-read">
        <button
          type="button"
          className="primary"
          onClick={() => void readPapers()}
          data-testid="read-papers"
          {...(reading !== null
            ? { disabled: true }
            : inertAttrs("read-papers", readPapersReason(papers.length, unread.length, namedOnly)))}
        >
          {reading ?? readLabel}
        </button>
        {reading === null && (
          <InertNote control="read-papers" reason={readPapersReason(papers.length, unread.length, namedOnly)} />
        )}
        <p className="small muted" data-testid="read-papers-scope">
          {readPapersScope(unread.length, papers.length)}
        </p>
        {/* M29b. A paper the reader would not draft from is a finding rather
            than a silence: it read a methods paper about language models for a
            study of night-ward handoffs and drafted from it, and nothing said
            so. Named here because this is where the reading list lives. */}
        {/* M51, ISC-533, then M89: the count of open paper notices stood here
            until the notices went with the checks. Each paper's own row asks
            what the paper bears on. */}
        {readError !== null && (
          <p className="error small" role="alert" data-testid="read-papers-error">
            {readError}
          </p>
        )}
      </div>

      {/* M83, ISC-700: where Add to ontology sends an expectation, once for the
          page (C6), and only while some paper below offers the control. */}
      {offersAdd && (
        <p className="small muted" data-testid="add-to-ontology-note">
          {ADD_NOTE}
        </p>
      )}
      <div className="corpus-docs row-list" data-testid="literature-docs">
        {/* R4 item 3. The empty state repeated the section lede two paragraphs
            above it, on a picker that already carried six sentences. */}
        {documents.map((doc) => {
          const judged = verdicts.get(doc.id);
          const bearing = bearings.get(doc.id);
          /* Where this paper stands with the researcher (M51, ISC-533). The same
             function the typed rows above and the companion panel on Design
             read, so one paper cannot be asked about on one surface and placed
             on another. */
          const standing = paperStanding({
            ...(judged === undefined ? {} : { verdict: judged }),
            ...(bearing === undefined ? {} : { bearing }),
          });
          return (
            /* M32 R8. A paper is a row.
             *
             * It was a bordered box with its own radius, stacked, and the
             * Remove control sat at the foot of every one of them whether the
             * researcher was reaching for it or not. The control is in the
             * row's reveal cluster now, held open while the confirmation is
             * armed so it cannot vanish under the hand mid-gesture, and the
             * box is one hairline to the next row.
             *
             * No mark. A paper is not a claim in the model, and a disc here
             * would assert an identity it does not have.
             *
             * The verdict sentence keeps its place, which is this row: both
             * this row and the typed line above key on the same document, so
             * when the line has a file behind it the reason is printed here and
             * the line keeps the chips. That is the owner's own report and it
             * is the reason the sentence is in the body rather than in the
             * cluster with Remove. */
            <Row
              key={doc.id}
              /* `.corpus-lit-doc` came off with the flex box it named. It was
                 the paper row's own card — display, padding, wrap — and all
                 four are the primitive's now, so the class reached no rule. */
              className="corpus-doc"
              testId={`literature-doc-${doc.id}`}
              actionsHeld={arming === doc.id}
              actions={
                /* A paper can be the wrong paper, and until now the only way
                   out was to delete the study. What it drafted stays on the
                   record either way. */
                <RemoveDocument
                  projectId={projectId}
                  document={doc}
                  chunks={chunks}
                  armed={arming === doc.id}
                  onArm={() => setArming(doc.id)}
                  onCancel={() => setArming(null)}
                  onRemoved={onAdded}
                />
              }
            >
              {/* The row's first line: the file, then its facts, in the same
                  place on every row so the eye runs down a column rather than
                  re-reading each entry. A line of its own inside the row's body
                  because the two sentences below it are lines of their own, and
                  before M32 all four were flex items in one wrapping box. */}
              <div className="corpus-lit-line">
                <span className="corpus-doc-name">{doc.name}</span>
                <span className="corpus-doc-meta">
                  <StatusChip label="paper" />
                  {/* M52, ISC-536. The passage count went from this row here.
                      ISC-530 took DOCUMENTS, PASSAGES, WORDS, OPENED and CITED
                      off Design and Material, and the data rows below lost their
                      four in the same pass, but this one survived: an uploaded
                      paper read "PASSAGES 92" beside its name. It is not a
                      number a researcher decides anything by while they are
                      adding a reading list, and the record panel, Your model's
                      census and the exports all still carry the tally for a
                      reader who wants it.

                      The count itself is still read, twice, and both readings
                      are about whether the file was readable rather than about
                      how much of it there is: `paperRowState` below turns zero
                      passages into "reading" or "unreadable", and the note under
                      the row says so in a sentence. A file the tool could not
                      read still says so; what is gone is the tally on a file it
                      could. */}
                  {/* The verdict, beside the paper, as soon as there is one
                      (M29c). Three states and a fourth, and the fourth is the one
                      the old build could not show: a paper nobody has judged yet
                      reads as nothing at all, rather than as a paper that passed. */}
                  <PaperFitChip
                    verdict={verdicts.get(doc.id)?.verdict}
                    state={paperRowState({
                      passages: passagesByDoc.get(doc.id) ?? 0,
                      uploading: busy !== null,
                      judging,
                    })}
                  />
                  {/* What this paper has produced (walk finding). A researcher
                      deciding whether to press the button again should be able to
                      see, per paper, whether it has been read at all. */}
                  {(readCounts.get(doc.id)?.drafts ?? 0) > 0 && (
                    <StatusChip
                      label={expectationsFrom(readCounts.get(doc.id)?.drafts ?? 0)}
                      testId={`expectations-${doc.id}`}
                    />
                  )}
                </span>
              </div>
              {/* The reader's own sentence, beside the paper it is about. A
                  notice saying only that a paper does not fit is one the
                  researcher can neither act on nor argue with. */}
              {/* M51, ISC-533. One sentence, and only on a paper the tool
                  placed: on a paper it could not place, the judge's sentence and
                  the finding's sentence were both the dismissal, and the row
                  carries the question instead. */}
              {/* M78b: a placed paper's sentence opens its relate line below, so it is said once. */}
              {showsJudgeSentence(judged) && (judged?.reason ?? "") !== "" && placingOf(standing, judged) === undefined && (
                <p className="small muted" data-testid={`literature-verdict-${doc.id}`}>
                  {judged?.reason}
                </p>
              )}
              {/* A file the tool could not read (walk item 3). It was accepted
                  in silence: no passage count, no verdict, no message, and the
                  reader had no way to know the upload had produced nothing. */}
              {busy === null && (passagesByDoc.get(doc.id) ?? 0) === 0 && (
                <p className="small muted" data-testid={`literature-unreadable-${doc.id}`}>
                  {UNREADABLE_NOTE}
                </p>
              )}
              {/* M33. What this paper expects, under the verdict that judged
                  it. The verdict tells the researcher the tool has an opinion
                  about their reading list; this is the thing they can argue
                  with, and it is what the interviewer will put to them. */}
              {/* M78b, ISC-681: the question under every paper (see the typed rows above). */}
              <PaperBearing
                projectId={projectId}
                paperKey={doc.id}
                paperName={doc.name}
                {...(bearing === undefined ? {} : { bearing })}
                placing={placingOf(standing, judged)}
                placingFrom={placingOf(standing, judged) === undefined ? undefined : judged?.eventId}
                onSaved={() => void bearingSaved()}
                testId={doc.id}
              />
              {standing !== "asking" && (
                <PaperExpectations
                    projectId={projectId}
                    {...(judged === undefined ? {} : { verdict: judged })}
                    settled={settled}
                    staged={stagedTitles}
                    framingDigest={digest}
                    judgeable={judgeable}
                    {...(bearing === undefined ? {} : { said: bearing.reason })}
                    onChanged={onAdded}
                    testId={doc.id}
                  />
              )}
            </Row>
          );
        })}
      </div>
    </section>
  );
}

