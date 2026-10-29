/**
 * Which expectation did your setting break, and what does that claim owe you?
 * (M29, R4, spec A3.)
 *
 * The single most consequential move in a qualitative design, and until now the
 * tool could not record it. `PuzzleRelation` has existed since ISC-20 with four
 * values and an evidentiary burden attached to each, `OBLIGATIONS` has been
 * checking those burdens for a dozen milestones, and `checkAllObligations`
 * returned an empty array in every real study because nothing anywhere wrote a
 * `stands-to` edge. The whole framing layer was live and unreachable.
 *
 * Two questions, asked in this order and never merged.
 *
 *   1. Which of the expectations you took from the papers is the one your
 *      setting broke. The options are the accepted theory claims, plus two
 *      answers that are not evasions: none of these, and I have not named it
 *      yet. Both are recorded, with the reason, because what a researcher
 *      declines to attach their puzzle to is evidence about the boundary of
 *      their own account and a tool that discarded it would throw away the
 *      measurement.
 *
 *   2. Which of the four claims you are making, with what each one owes shown
 *      beside it. The requirement strings come from `OBLIGATIONS` and are
 *      already written in the researcher's terms, so the researcher chooses
 *      knowing the price rather than discovering it on the Checks tab.
 *
 * ── Why the second question is neutral, and what that buys ─────────────────
 *
 * Nothing here recommends a relation. Four options, four burdens, no default
 * and no ordering by likelihood. That is the condition under which the accepted
 * edge is stamped `author-prior` rather than `model-proposed` (R3, E2):
 * choosing among four framings with their costs on the table is a judgment the
 * researcher made, and calling it a ratification of the model would credit the
 * tool with the most important decision in the design. Where the tool names the
 * relation it thinks applies, the proposal carries no `originOnAccept` and the
 * accept is a ratification like any other.
 *
 * `exposes` is the most flattering of the four and the heaviest, and this is
 * the screen where a researcher can read that and downgrade on purpose. That is
 * the thumb on the scale the design asked for, applied by showing the price
 * rather than by hiding the option.
 *
 * ── One door ──────────────────────────────────────────────────────────────
 *
 * The pick writes a `ProposalEvent` and then adjudicates it, in that order, in
 * one act. It does not write an `ontology-mutation` itself. The proposal door
 * is the only way into the model and a second door opened here for one edge
 * would be the beginning of the end of that guarantee, so the cost is one extra
 * event and the record reads as what happened: the tool drafted the edge the
 * researcher chose, and the researcher took it.
 */

import { useCallback, useState } from "react";
import type { LedgerEvent, ProposalEvent, PuzzleRelation, QuestionSelectionEvent, RefusalEvent } from "../ledger/events.ts";
import { PUZZLE_RELATIONS } from "../ledger/events.ts";
import {
  OBLIGATIONS,
  RELATION_BURDEN,
  expectationSource,
  expectationsOnOffer,
} from "../ontology/relations.ts";
import type { OntologyGraph, OntologyPage } from "../ontology/schema.ts";
import { livePages, pagesOfType } from "../ontology/schema.ts";
import { adjudicateProposal } from "../proposals/adjudicate.ts";
import { useLedger } from "../state/ledgerContext.tsx";

/** The two answers that are not a theory page, and what each one means. */
export const DECLINES = [
  {
    id: "none-of-these",
    label: "None of these expectations",
    /** Written onto the record, so a reader knows which answer was given. */
    note: "The expectation that this setting broke is outside your ontology.",
  },
  {
    id: "not-named-yet",
    label: "I haven't named the expectation yet",
    note: "The expectation that this setting broke isn't in your ontology yet.",
  },
] as const;

export type DeclineId = (typeof DECLINES)[number]["id"];

/** The topic both declines are counted under, so three of them silence it. */
export const CHOOSER_TOPIC = "framing:expectation-broken";

export const CHOOSER_QUESTION =
  "Which of these expectations is the one that your setting broke?";

export const RELATION_QUESTION =
  // M28 r6: copy. 26 words, four branches in one sentence, and "that
  // literature" twice where the product says "the papers". The four answers
  // are the buttons directly under it, so the question does not have to list
  // them: it has to say what it is asking about.
  "How does your setting stand to this expectation?";

/**
 * Whether this study is at the point where the question is worth putting.
 *
 * A live puzzle with nothing it stands to, and at least one expectation to
 * offer. Asking before there is an expectation would be asking the researcher
 * to invent one in a radio list, which is the tool doing their framing for them.
 */
export function chooserOpens(graph: OntologyGraph): boolean {
  /* Walk item 2: the offer, not every theory page. A claim the model drew out
   * of the researcher's transcript is their explanation of the thing they are
   * puzzled by, not an expectation their setting broke. */
  if (expectationsOnOffer(graph).length === 0) return false;
  return graph.puzzleRoots.some((id) => !graph.relations.some((r) => r.puzzleId === id));
}

/** The puzzle the question is about: the first live root with no claim on it. */
export function puzzleToClaim(graph: OntologyGraph): OntologyPage | null {
  const live = new Set(livePages(graph).map((p) => p.id));
  const id = graph.puzzleRoots.find(
    (candidate) => live.has(candidate) && !graph.relations.some((r) => r.puzzleId === candidate),
  );
  return id === undefined ? null : (graph.pages.get(id) ?? null);
}

/**
 * The four, in the order they are offered.
 *
 * Lightest burden first, which is the opposite of the order they are ranked in
 * everywhere else in the engine. `checkAllObligations` sorts heaviest unmet
 * first because it is showing the researcher the claim most likely to be
 * over-reaching; this is a list they are choosing from, and putting `exposes`
 * at the top would make the biggest claim the first one read.
 */
export const RELATION_ORDER: readonly PuzzleRelation[] = [...PUZZLE_RELATIONS].sort(
  (a, b) => RELATION_BURDEN[a] - RELATION_BURDEN[b],
);

/** How each option reads as a sentence about this study. */
export const RELATION_CHOICE: Readonly<Record<PuzzleRelation, string>> = {
  silent: "The literature is silent on this point",
  instantiates: "Your setting instantiates a split already in that literature",
  contradicts: "Your setting contradicts this expectation",
  exposes: "Your setting exposes a conflict inside that literature",
};

/** The draft the researcher's two answers add up to, as the tray would show it. */
export function relationDraft(
  puzzle: OntologyPage,
  theory: OntologyPage,
  relation: PuzzleRelation,
): { readonly title: string; readonly body: string } {
  return {
    title: `${puzzle.title} ${relation} ${theory.title}`,
    body: [
      `You said your setting ${RELATION_CHOICE[relation].replace(/^(Your setting|The literature) /, "").toLowerCase()}.`,
      OBLIGATIONS[relation].requirement,
    ].join(" "),
  };
}

/** Ids and clock, injected so a test gets the same events twice. */
export interface ChooserOptions {
  readonly now?: () => number;
  readonly makeId?: () => string;
}

/**
 * The staged edge, built rather than inlined in the handler.
 *
 * Exported because the two things worth asserting about this panel are what it
 * writes and what origin that write earns, and neither is reachable through a
 * rendered radio button. The handler below calls this and appends what it
 * returns, so a test of this function is a test of the panel's whole effect on
 * the record.
 */
export function relationProposal(
  input: {
    readonly projectId: string;
    readonly puzzle: OntologyPage;
    readonly theory: OntologyPage;
    readonly relation: PuzzleRelation;
    /**
     * Whether the four were shown side by side with none recommended (R3, E2).
     *
     * True everywhere in this panel, and the parameter exists because the other
     * caller is coming: a literature move where the tool names the relation it
     * thinks applies. That accept is a ratification and stays `model-proposed`,
     * and the difference has to be decided by whoever drafted it rather than
     * inferred afterwards by the door.
     */
    readonly researcherChose: boolean;
  },
  options: ChooserOptions = {},
): ProposalEvent {
  const now = options.now ?? (() => Date.now());
  const makeId = options.makeId ?? (() => crypto.randomUUID());
  const draft = relationDraft(input.puzzle, input.theory, input.relation);
  return {
    id: makeId(),
    ts: now(),
    actor: "human",
    projectId: input.projectId,
    type: "proposal",
    proposalId: makeId(),
    edge: { from: input.puzzle.id, to: input.theory.id, role: "stands-to" },
    puzzleRelation: input.relation,
    ...(input.researcherChose ? { originOnAccept: "author-prior" as const } : {}),
    title: draft.title,
    body: draft.body,
    sourceChunks: [],
  };
}

/**
 * A decline, as the pair of events it is.
 *
 * The tool asked a question and the researcher turned it down, which is the
 * pair `orchestrator.ts` writes for every other question the tool puts. Writing
 * only the refusal would leave it pointing at a question nobody could read, and
 * writing only the question would leave one standing open on the Design tab.
 * They are appended together for that reason, so the interview state never
 * observes the gap between them.
 */
export function declineEvents(
  input: {
    readonly projectId: string;
    readonly decline: DeclineId;
    /** Every expectation that was on offer, for the record of what was refused. */
    readonly offered: readonly string[];
  },
  options: ChooserOptions = {},
): readonly [QuestionSelectionEvent, RefusalEvent] {
  const now = options.now ?? (() => Date.now());
  const makeId = options.makeId ?? (() => crypto.randomUUID());
  const entry = DECLINES.find((d) => d.id === input.decline) ?? DECLINES[0];
  const questionId = makeId();
  const ts = now();
  return [
    {
      id: questionId,
      ts,
      actor: "human",
      projectId: input.projectId,
      type: "question-selection",
      moveId: `${CHOOSER_TOPIC}@${ts}`,
      topic: CHOOSER_TOPIC,
      question: CHOOSER_QUESTION,
      alternatives: [...input.offered, ...DECLINES.map((d) => d.label)],
      mode: "interrogation",
      reason:
        "Your puzzle has an expectation still to attach, and your ontology has expectations that the puzzle could break.",
    },
    {
      id: makeId(),
      ts,
      actor: "human",
      projectId: input.projectId,
      type: "refusal",
      questionEventId: questionId,
      /* "Not now" for the one that is a deferral and "won't answer" for the one
       * that is an answer. Saying none of these is a decision about the model,
       * not a postponement of one, and the two must stay distinguishable: three
       * of either silences the topic, and silencing on a decision is right
       * where silencing on a postponement is the tool giving up early. */
      kind: input.decline === "not-named-yet" ? "not-now" : "wont-answer",
      note: entry.note,
    },
  ];
}

export function ExpectationChooser(props: {
  projectId: string;
  graph: OntologyGraph;
  /** Called once the answer is on the record, so the page can close the panel. */
  onDone?: () => void;
}) {
  const { projectId, graph, onDone } = props;
  const { appendAll, readEvents } = useLedger();
  const [chosen, setChosen] = useState<string | null>(null);
  const [relation, setRelation] = useState<PuzzleRelation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puzzle = puzzleToClaim(graph);
  const theories = expectationsOnOffer(graph);
  const declineId = DECLINES.find((d) => d.id === chosen)?.id;
  const theory = theories.find((t) => t.id === chosen) ?? null;

  /** A decline, on the record with its reason. See `declineEvents`. */
  const decline = useCallback(
    async (id: DeclineId) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await appendAll([
          ...declineEvents({
            projectId,
            decline: id,
            offered: theories.map((t) => t.title),
          }),
        ]);
        onDone?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [appendAll, busy, onDone, projectId, theories],
  );

  /**
   * The pick, staged and taken in one act.
   *
   * `originOnAccept` is the whole reason this is not an ordinary accept. The
   * four options were shown side by side with none recommended, so the choice
   * is the researcher's judgment and the edge is stamped `author-prior`.
   * `adjudicate.ts` is the only place that reads the field and the only place
   * that writes an origin.
   */
  const take = useCallback(async () => {
    if (puzzle === null || theory === null || relation === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const proposal = relationProposal({
        projectId,
        puzzle,
        theory,
        relation,
        // Four options, no recommendation. See the module note on R3 and E2.
        researcherChose: true,
      });
      await appendAll([proposal as LedgerEvent]);
      const outcome = await adjudicateProposal(
        { projectId, proposalId: proposal.proposalId, disposition: "accept" },
        { appendAll, readEvents },
      );
      if (outcome.kind === "rejected") {
        setError(`Abductive couldn't save your choice: ${outcome.errors.join("; ")}`);
        return;
      }
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [appendAll, busy, onDone, projectId, puzzle, readEvents, relation, theory]);

  if (puzzle === null || theories.length === 0) return null;

  return (
    <section className="expectation-chooser" data-testid="expectation-chooser">
      <h3>{CHOOSER_QUESTION}</h3>
      <p className="small muted">
        Your puzzle is that {puzzle.title}. Say which expectation it breaks and Abductive records
        that claim's debt.
      </p>

      <ul className="chooser-options" data-testid="chooser-expectations">
        {theories.map((page) => (
          <li key={page.id}>
            <label>
              <input
                type="radio"
                name="expectation"
                value={page.id}
                checked={chosen === page.id}
                onChange={() => setChosen(page.id)}
                data-testid={`expectation-${page.id}`}
              />{" "}
              {page.title}{" "}
              {/* Where the expectation comes from, beside the option rather than
                  after the list (M44). Two kinds of thing are on this list now: an
                  expectation from a paper and an expectation people in the setting
                  hold, and a researcher choosing between them has to be able to see
                  which is which. The phrase is written in `ontology/relations.ts`
                  beside the offer itself, so the list and the claims table cannot
                  describe one expectation two ways. */}
              <span className="small muted chooser-source" data-testid={`source-${page.id}`}>
                {expectationSource(page)}
              </span>
            </label>
          </li>
        ))}
        {DECLINES.map((option) => (
          <li key={option.id}>
            <label>
              <input
                type="radio"
                name="expectation"
                value={option.id}
                checked={chosen === option.id}
                onChange={() => setChosen(option.id)}
                data-testid={`expectation-${option.id}`}
              />{" "}
              {option.label}
            </label>
          </li>
        ))}
      </ul>

      {declineId !== undefined && (
        <p className="chooser-decline">
          <button
            type="button"
            className="primary"
            disabled={busy}
            data-testid="chooser-record-decline"
            onClick={() => void decline(declineId)}
          >
            {busy ? "Saving…" : "Save"}
          </button>{" "}
          <span className="small muted">
            Abductive writes your answer down and stops asking. You can come back to the question later.
          </span>
        </p>
      )}

      {theory !== null && (
        <div className="chooser-relations" data-testid="chooser-relations">
          <h4>{RELATION_QUESTION}</h4>
          {/* What each one costs, beside the option rather than after it. A
              researcher who reads the burden before choosing can pick the
              smaller claim on purpose, which is the only moment in the flow
              where that choice is cheap. */}
          <ul className="chooser-options">
            {RELATION_ORDER.map((option) => (
              <li key={option}>
                <label>
                  <input
                    type="radio"
                    name="relation"
                    value={option}
                    checked={relation === option}
                    onChange={() => setRelation(option)}
                    data-testid={`relation-${option}`}
                  />{" "}
                  {RELATION_CHOICE[option]}
                </label>
                <p className="small muted chooser-owes" data-testid={`owes-${option}`}>
                  {OBLIGATIONS[option].requirement}
                </p>
              </li>
            ))}
          </ul>
          {/* Rendered once a claim is picked rather than sitting disabled until
              then. A control that is dead on the screen has to say what would
              wake it, and the sentence that would say it here is the list of
              four directly above: `inert-state.test.ts` holds the rule and this
              is the shape that satisfies it without adding a sentence nobody
              needs. The decline button above appears the same way. */}
          {relation !== null && (
            <p>
              <button
                type="button"
                className="primary"
                disabled={busy}
                data-testid="chooser-record-relation"
                onClick={() => void take()}
              >
                {busy ? "Saving…" : "Save claim"}
              </button>{" "}
              {/* D28 (M43c). It read "This claim joins your model as your own
                  judgement, marked as yours." and what this button writes is a
                  `stands-to` link between two claims that are already in the
                  model, stamped `author-prior` on the edge. So the census under
                  the claims table, which counts claims, went on reading "0
                  yours" directly under a promise that something of the
                  researcher's had just joined their model. The sentence names
                  the link now, which is the thing that gets recorded and the
                  thing the record marks as theirs. */}
              <span className="small muted">
                This link joins your puzzle to the expectation, and History marks the judgement
                as yours.
              </span>
            </p>
          )}
        </div>
      )}

      {error !== null && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
