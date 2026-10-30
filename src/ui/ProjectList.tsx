/**
 * The studies list (ISC-17 entry), rebuilt as the home surface it is.
 *
 * What shipped before this round, measured live at 1440:
 *
 *   Every study rendered as a card holding its title as a 14px/400 underlined
 *   anchor, a 76x39 red-bordered Delete button 16px to its right, and one line
 *   reading "Stage: Design Brief · created 5 August 2026". The heaviest object
 *   in the row was the control that throws work away, and the only fact the row
 *   carried about the study was the day it was named. Stage was in there twice
 *   over, in the sense that every study in the fixture read "Design Brief" and
 *   always will until the researcher reaches data: a column whose every cell
 *   holds the same value is a column that costs a scan and returns nothing.
 *
 *   The page ended at 416px of an 806px window with the right half of the frame
 *   empty, because a two-track card grid holding two studies leaves one track
 *   blank and the cards themselves held four lines between them.
 *
 * What this is instead. A study has state, all of it already in the ledger and
 * none of it on this screen: how much of the design is answered, how big the
 * ontology is, what the model has drafted and is waiting on a decision about,
 * how many structural observations stand, how many questions have been put, and
 * when it was last touched. Six facts per study, in six columns that line up
 * down the page so the eye compares rather than reads.
 *
 * Two commitments in how they are drawn.
 *
 * Every number is the link to the view that number is about. A count with no
 * route out of it is a dead end, and a separate row of six navigation links
 * beside six counts is the same information twice.
 *
 * The counts are computed by the same calls the study's own tabs make:
 * `projectOntology`, `projectProposals`, `projectInterview` and
 * `projectConcepts`. The Flags column, which ran the checks' own calls, went
 * with the checks at M89 (the owner, 2026-10-14). A summary that disagrees with the
 * screen it summarises is worse than no summary, so the way to keep them in
 * step is to run the same functions rather than to write a second estimate.
 * tests/shell-entry.test.ts holds the two to each other.
 *
 * Delete is two clicks now. It was one, on the home screen, on a control drawn
 * heavier than the study it destroys, with no way back: the ledger keeps the
 * events but the study, its documents and its passages are gone. The
 * destructive palette appears on the second step, where the consequence is.
 *
 * M71 (ISC-650, ISC-651). The resting control was bare, faint, one word and
 * partly behind the table's scrollbar, and the owner looked for a way to
 * delete a project and did not find it. It is a quiet button reading "Delete
 * project" now (L4: a destructive control names its object), in the project
 * cell, still one step from the confirmation row, and a delete prints
 * "Deleted <title>." under the page's summary line.
 */

import { puzzleOfRecord } from "../views/puzzleReading.ts";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  deleteProject,
  emptyBrief,
  listChunks,
  listProjects,
  normalizeBrief,
  saveProject,
  type Project,
} from "../state/projects.ts";
import { navigate, studyPath } from "./routes.ts";
import { useLedger } from "../state/ledgerContext.tsx";
import { BringInStudy } from "./BringInStudy.tsx";
import { EmptyState, InertNote, StatusChip, inertAttrs } from "./components/index.ts";
import { formatDay } from "./format.ts";
import { MAIN_LANDMARK_ID } from "./landmarks.ts";
import { STATIONS, stationById, type StationId } from "../flow/stations.ts";
import { stationStates, type StationState } from "../flow/stationBrief.ts";
import { projectOntology } from "../ontology/projection.ts";
import { inInbox, projectConcepts } from "../concepts/projection.ts";
import { projectProposals } from "../proposals/projection.ts";
import { projectInterview } from "../interview/state.ts";
import { dataOnly } from "../state/chunks.ts";
// M38, ISC-492. The chip on this list and the line in the study header say the
// same thing about the same study, so they read the same function. It was
// `interview.outstanding !== null` here, which is the same fact derived twice,
// and FIN-02 is what two derivations of one fact cost.
import { openQuestionAt } from "../views/placeSummary.ts";
import type { LedgerEvent } from "../ledger/events.ts";
import { HelpControl } from "./HelpControl.tsx";

/**
 * Said on the document after a delete, so the sidebar's list of projects, which
 * re-reads only on a route change, drops the project while the researcher stays
 * on this page (M71).
 */
export const PROJECTS_CHANGED_EVENT = "abductive:projects-changed";

/** The line this page prints after a delete (M71, L9's register). */
export function deletedLine(title: string): string {
  return `Deleted ${title}.`;
}

/** What "Create study" is waiting to read; null once it is live. */
export function createReason(title: string): string | null {
  return title.trim() === "" ? "Name the project first." : null;
}

/**
 * Everything the list says about one study, all of it derived and none of it
 * stored.
 */
export interface StudyState {
  readonly project: Project;
  /**
   * Every statement in the model, placed or awaiting a home (M73, ISC-659, the
   * lead's ruling). The column counted live ontology pages, which nothing has
   * written since M63, so a project with an accepted concept read 0; counting
   * concepts instead took the shipped example from 45 to 0, because its 45
   * pages are statements still waiting for a concept.
   */
  readonly statements: number;
  /** Accepted concepts, named in the project's cell with the relations. */
  readonly concepts: number;
  /** Accepted relations between concepts. */
  readonly relations: number;
  /**
   * Every suggestion waiting on a decision (M73, ruled into ISC-659): concepts,
   * relations and statements Abductive suggested since M63, plus the legacy
   * tray's drafts. It counted the tray alone, which nothing fills since M63, so
   * a project with three suggested concepts read 0.
   *
   * Model drafts written up and not yet accepted, rejected, merged or deferred.
   * The column reads "Waiting", which is what the Ontology tab and the Design
   * banner both call this population; the field keeps its old name because it
   * is the tray's own word for the same thing and renaming it would touch four
   * call sites to no reader's benefit.
   */
  readonly staged: number;
  /** Questions put to the researcher in this study. */
  readonly turns: number;
  /** A question has been asked and not yet answered, declined or steered past. */
  readonly questionOnTable: boolean;
  /** The eight stations, in the rail's own three resting states. */
  readonly stations: readonly (readonly [StationId, StationState])[];
  /** How many of the eight the researcher has said something at. */
  readonly answered: number;
  /** The most recent event in this study, or the moment it was named. */
  readonly touchedAt: number;
}

/**
 * The derivation, kept out of the component so the numbers can be checked
 * against the workbench's without rendering anything.
 *
 * The gauge reads two states (answered and not, since M69 took the set-aside
 * away) and the column header says what it reads.
 */
export function studyState(args: {
  project: Project;
  events: readonly LedgerEvent[];
  corpusChunkIds: readonly string[];
}): StudyState {
  const { project, events, corpusChunkIds } = args;
  const scoped = events.filter((e) => e.projectId === project.id);
  const graph = projectOntology(events, project.id);
  const tray = projectProposals(events, project.id);
  const interview = projectInterview(events, project.id);
  const ontology = projectConcepts(events, project.id, graph);

  const brief = normalizeBrief(project.brief);
  const states = stationStates(brief, corpusChunkIds.length);
  const stations = STATIONS.map((s) => [s.id, states.get(s.id) ?? "empty"] as const);

  let touchedAt = project.createdAt;
  for (const e of scoped) if (e.ts > touchedAt) touchedAt = e.ts;

  return {
    project,
    /* M75, ISC-669 (the lead's ruling B): statements from a step summary, the
       researcher's replies at a step or a read of the data; a paper's claim and a
       rival are not statements in this sense. */
    statements: [...ontology.statements.values()].filter((s) => inInbox(s.from)).length,
    concepts: ontology.accepted.length,
    relations: ontology.acceptedRelations.length,
    staged:
      tray.pending.length +
      ontology.suggested.length +
      ontology.suggestedRelations.length +
      ontology.suggestedStatements.length,
    turns: interview.turns,
    questionOnTable: openQuestionAt(events, project.id) !== null,
    stations,
    answered: stations.filter(([, state]) => state === "stated").length,
    touchedAt,
  };
}

/**
 * The project's steps in words, for the Steps column (M84, ISC-705): the first
 * step in the rail's order without an answer, or that every step has one.
 */
export function stepsLine(row: Pick<StudyState, "stations">): string {
  const next = row.stations.find(([, state]) => state === "empty");
  return next === undefined ? "Every step has an answer" : `Next step: ${stationById(next[0]).label}`;
}

/**
 * The concepts and relations, for the project's cell (M73): "2 concepts, 1
 * relation", a part only when it is above zero, and nothing when both are zero.
 */
export function ontologyLine(concepts: number, relations: number): string | null {
  const parts: string[] = [];
  if (concepts > 0) parts.push(`${concepts} concept${concepts === 1 ? "" : "s"}`);
  if (relations > 0) parts.push(`${relations} relation${relations === 1 ? "" : "s"}`);
  return parts.length === 0 ? null : parts.join(", ");
}

/** Newest activity first: the study you were last in is the one you want. */
export function byMostRecent(a: StudyState, b: StudyState): number {
  return b.touchedAt - a.touchedAt;
}

/**
 * One line for the head of the page, so the count is not something the reader
 * has to make by counting rows.
 */
export function studiesSummary(rows: readonly StudyState[]): string {
  if (rows.length === 0) return "You haven't added a project yet.";
  const waiting = rows.filter((r) => r.questionOnTable || r.staged > 0).length;
  const studies = `${rows.length} project${rows.length === 1 ? "" : "s"}`;
  if (waiting === 0) return `${studies}. You're up to date on every project.`;
  return `${studies}, ${waiting} with something for you to do.`;
}

export function ProjectList() {
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [corpus, setCorpus] = useState<ReadonlyMap<string, readonly string[]>>(new Map());
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  /* Which study's Delete has been armed, by id. One at a time: arming a second
   * disarms the first, because two live confirmations on one screen is how a
   * researcher confirms the wrong one. */
  const [arming, setArming] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  /* M71. "Deleted <title>." under the summary line after a delete. */
  const [deleted, setDeleted] = useState<string | null>(null);
  const { events } = useLedger();

  useEffect(() => {
    let cancelled = false;
    void listProjects().then(async (list) => {
      if (cancelled) return;
      setProjects(list);
      /* The corpus is the eighth station's content, so the gauge cannot be
       * drawn without it. One read per study, on a screen that lists a handful
       * of them. */
      const entries = await Promise.all(
        // Data only (D5). The gauge this feeds is the early-data station's, and
        // the papers a researcher is arguing with are not early data; counting
        // them here marked the station answered on the strength of a reading
        // list.
        list.map(async (p) => [p.id, dataOnly(await listChunks(p.id)).map((c) => c.id)] as const),
      );
      if (!cancelled) setCorpus(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function createProject(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length === 0 || busy) return;
    setBusy(true);
    const project: Project = {
      id: crypto.randomUUID(),
      title: trimmed,
      stage: "design-brief",
      brief: emptyBrief(),
      createdAt: Date.now(),
    };
    await saveProject(project);
    setBusy(false);
    setTitle("");
    /* M53, ISC-540. A new study opens on its theoretical motivation, which is
       the first tab and the first thing there is to say about a study. */
    navigate(studyPath(project.id, "motivation"));
  }

  /* The researcher stays on this page: the list re-reads, the line says what
   * went, and the sidebar is told. */
  const remove = useCallback((project: Project) => {
    setArming(null);
    void deleteProject(project.id).then(() => {
      setDeleted(deletedLine(project.title));
      setReload((n) => n + 1);
      document.dispatchEvent(new CustomEvent(PROJECTS_CHANGED_EVENT));
    });
  }, []);

  const rows = projects
    .map((project) =>
      studyState({ project, events, corpusChunkIds: corpus.get(project.id) ?? [] }),
    )
    .sort(byMostRecent);

  return (
    <main className="studies" id={MAIN_LANDMARK_ID} tabIndex={-1}>
      <div className="studies-head">
        <h1>Projects</h1>
        <p className="studies-summary" data-testid="studies-summary">
          {studiesSummary(rows)}
        </p>
        {/* M62, ISC-600: the page's Help control, at the head's right end. */}
        <HelpControl page="studies" />
        {deleted !== null && (
          <p className="small studies-deleted" role="status" data-testid="studies-deleted">
            {deleted}
          </p>
        )}
      </div>

      <div className="studies-layout">
        <div className="studies-main">
          {rows.length === 0 ? (
            <EmptyState
              status="You haven't added a project yet."
              teach="Name a project in the box beside this list to start."
              testId="studies-empty"
            />
          ) : (
            /* The wrapper scrolls, the document does not. When the table is
             * wider than its pane it keeps its columns and takes a scrollbar of
             * its own rather than dropping facts or pushing the page sideways.
             * M71: eight columns needed 852px in the 742px pane at a 1398px
             * window, so the last column sat behind that scrollbar; the seven
             * left after Delete project moved into the project cell take
             * 742px there. */
            <div className="studies-tablewrap">
              <table className="studies-table" data-testid="studies-table">
                <caption className="visually-hidden">
                  Your projects, most recently changed first, with the contents of each one.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Project</th>
                    <th scope="col">Steps</th>
                    {/* M73, ISC-659: "Claims" while it counted pages; every
                        statement in the model now, with the concepts and
                        relations named in the project's cell. */}
                    <th scope="col" className="study-num">
                      Statements
                    </th>
                    {/* "Staged" and "Issues" were this table's own words for two
                        objects the rest of the app already names. The Ontology
                        tab heads the same population "Waiting to go into your
                        ontology" and the Design banner calls it "pages … waiting on
                        you"; Coherence, Biases and the Memo card all say
                        "findings" and this column said "issues", which is the
                        word FindingRow's own history names as the one that made
                        two surfaces look like they were counting different
                        things. The column links to the tab that owns the noun,
                        so the noun is the tab's. */}
                    <th scope="col" className="study-num">
                      Suggestions
                    </th>
                    {/* M89: the Flags column went with the checks. */}
                    {/* M73: may wrap, as its dates do. "Statements" is 14px wider
                        than "Claims", and at a 1398px window that put this
                        column behind the table's scrollbar again (M71). */}
                    <th scope="col" className="study-when-head">Last changed</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <StudyRow
                      key={row.project.id}
                      row={row}
                      armed={arming === row.project.id}
                      onArm={() => setArming(row.project.id)}
                      onCancel={() => setArming(null)}
                      onRemove={() => remove(row.project)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="studies-aside" aria-label="About this list">
          <form className="card study-new" onSubmit={(e) => void createProject(e)}>
            <label className="field">
              Project name
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            {/* The worst-measured of the seven: a filled primary at opacity 0.5 put
                its white label at 3.00:1 on the paper behind it, and it is the only
                thing on the page a first-time researcher can press. Inert now reads
                as its own state rather than as a faded accept, and the condition is
                stated under it. */}
            <button
              className="primary"
              type="submit"
              {...(busy ? { disabled: true } : inertAttrs("create-study", createReason(title)))}
            >
              Create project
            </button>
            {!busy && <InertNote control="create-study" reason={createReason(title)} />}
          </form>

          {/* M36. The other way a study gets onto this list: a bundle from
            * someone else's Exports tab. In the same card as Create study
            * because the two are one question, where does this study come
            * from, and a picker on its own further down the aside would read
            * as a setting rather than as a way in. */}
          <div className="card study-new">
            <BringInStudy />
          </div>

          {/* A gauge with no key is a mark the reader has to guess at, which is
            * the defect the origin marks were rewritten twice to stop making.
            * Five columns, one line each: the aside was 825px tall on the first
            * cut and pushed a 75px table onto a second screen. */}
          <dl className="studies-key" data-testid="studies-key">
            <dt>Steps</dt>
            <dd>
              {/* M69, ISC-641: the half dot for a set-aside went with the control. */}
              {/* M84, ISC-705: the dots and the step that comes next, in words. */}
              The design steps. A filled dot means that you answered the step, and an empty dot means that you
              haven't answered the step yet. The line under the dots names the step that comes next.
            </dd>
            <dt>Statements</dt>
            <dd>Statements from a step summary, your replies at a step or a pass over your data, placed under a concept or a relation or still waiting for a home. The project's own cell counts its concepts and relations.</dd>
            <dt>Suggestions</dt>
            <dd>Suggestions that Abductive made and that wait for your decision: concepts, relations and statements. A suggestion joins your ontology only when you accept it.</dd>
          </dl>

          {/* The full account of what removing does moved onto the confirmation
            * row, where the researcher is about to do it, and this is what is
            * left: the one part they cannot act on from inside the tool. Saying
            * it is not optional, because a researcher who reads "Remove" and
            * believes their transcripts have left the browser has been misled by
            * us and not by themselves. */}
          <p className="muted small studies-note">
            Deleting a project leaves its events in History, which only ever grows. To clear
            those too, clear this site's data in your browser.
          </p>
        </aside>
      </div>
    </main>
  );
}

/**
 * One study.
 *
 * The armed confirmation is a second row rather than a popover: it has to be
 * able to say what removing does, in the open, at reading width, and a row in
 * the table it belongs to is the one place that costs nothing to reach.
 */
export function StudyRow(props: {
  row: StudyState;
  armed: boolean;
  onArm: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const { row, armed } = props;
  const { project } = row;
  /* M58, ISC-568: the researcher's answer at The puzzle step when there is
   * one, the tool's reading otherwise. */
  const question = puzzleOfRecord(normalizeBrief(project.brief))?.text ?? "";
  const ontology = ontologyLine(row.concepts, row.relations);
  return (
    <>
      <tr className="study-row" data-testid="study-row" data-armed={armed}>
        {/* The flex box is a div inside the cell rather than the cell itself.
            A th carrying `display: flex` stops being a table-cell and the
            column model has to synthesise an anonymous one around it, which is
            how a table with eight columns loses its alignment. */}
        <th scope="row">
          <div className="study-cell">
            <a className="study-title" href={studyPath(project.id)}>
              {project.title}
            </a>
            {/* The second line is its own flex row rather than a wrapped item
                of the first. As one wrapping container the chip took a line of
                its own and the row measured 110px; more to the point, the
                research question's capped width became the column's minimum and
                the eight columns summed to 873px inside an 848px track. Here
                the question is `flex: 1 1 0` with `min-width: 0`, so it
                contributes nothing to the minimum and truncates to whatever the
                column is given. */}
            {/* Three grid rows, not a flex line the two of them share. Beside
                the question the chip took 145px of a 325px column and left
                "How do patient storie…", and putting it first was worse. On its
                own row the row costs 21px extra and both facts are readable,
                which is the trade this list is for. */}
            {row.questionOnTable && <StatusChip label="Open question" tone="accent" />}
            <span className="study-rq">
              {question === "" ? "Your research question is still to come." : question}
            </span>
            {/* M73: the concepts and relations, which the Statements column
                does not count, on the project's own line when there are any. */}
            {ontology !== null && (
              <span className="study-ontology" data-testid="study-ontology">
                {ontology}
              </span>
            )}
            {/* A quiet button at rest (M71, ISC-650): visible without being
              * loud. The destructive palette belongs on the step that destroys,
              * not on the step that asks. In the project cell rather than an
              * eighth column: at a 1398px window the eight columns summed to
              * 852px in a 742px pane, and the last column, where this was, sat
              * behind the table's own scrollbar. */}
            <button
              type="button"
              className="btn-quiet study-remove"
              aria-expanded={armed}
              onClick={armed ? props.onCancel : props.onArm}
            >
              Delete project<span className="visually-hidden"> {project.title}</span>
            </button>
          </div>
        </th>

        <td>
          <a className="study-metric" href={studyPath(project.id, "design")}>
            <span className="study-gauge" aria-hidden="true">
              {row.stations.map(([id, state]) => (
                <span key={id} className="study-gauge-cell" data-state={state} />
              ))}
            </span>
            {/* M84, ISC-705 (a co-author, 2026-10-07: the counts are "a
                distraction… for qual people it will be about the flow"). The
                fraction went; the line names the step that comes next. */}
            <span className="study-metric-note" data-testid="study-steps">
              {stepsLine(row)}
            </span>
          </a>
        </td>

        <td className="study-num">
          <a className="study-metric" href={studyPath(project.id, "ontology")}>
            <span className="study-metric-n" data-testid="study-statements">{row.statements}</span>
          </a>
        </td>

        <td className="study-num">
          <a className="study-metric" href={studyPath(project.id, "ontology")}>
            <span className="study-metric-n" data-live={row.staged > 0}>
              {row.staged}
            </span>
          </a>
        </td>


        {/* Last touched, and not also the day it was named. The pair wrapped to
            five lines in an 87px column and took the row from 71px to 130px,
            and the creation date is a property of the study rather than a
            reading of its state, which is what this list is for. */}
        <td className="study-when">{formatDay(row.touchedAt)}</td>

      </tr>

      {armed && (
        <tr className="study-confirm" data-testid="study-confirm">
          <td colSpan={5}>
            <p className="study-confirm-text">
              Delete <strong>{project.title}</strong>? The project's documents and passages go with it, and you
              can't bring them back from inside Abductive. The events from this project stay in
              History.
            </p>
            <div className="btnrow">
              <button type="button" className="btn-danger" onClick={props.onRemove}>
                Delete project
              </button>
              <button type="button" className="btn-quiet" onClick={props.onCancel}>
                Cancel
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
