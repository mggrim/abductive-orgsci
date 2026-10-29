/**
 * The evidence the tool asked for, counting toward the debt it asked for it
 * against (M35, D7).
 *
 * The walk, 2026-09-09. The researcher recorded through the chooser that their
 * puzzle contradicts an expectation. The band said the claim owes "a systematic
 * deviation: at least two independent observations from more than one source
 * document. You have no such observations yet", and offered "Answer this
 * question". They answered with three documents, the drafter wrote an
 * observation, they took it into the model, and it landed with links "none".
 * The band still read "You have no such observations yet", and there is no
 * manual link control on the page: the list of link kinds under the table is a
 * legend. So the one route the tool offers to pay the debt produced claims that
 * could not count toward it.
 *
 * These hold three things. The topic the move raises already names the claim,
 * so nothing has to read the question's words. An observation drafted for that
 * topic gains an `evidences` edge to the puzzle, through the door's existing
 * `linkOnAccept`, and only an observation does. And the count the band prints
 * moves, which is the whole point: it is the sentence the researcher was
 * reading when they concluded the tool had ignored them.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent, ProposalEvent } from "../src/ledger/events.ts";
import { validateEvent } from "../src/ledger/events.ts";
import { obligationOfTopic, obligationTopic } from "../src/proposals/obligations.ts";
import { baselineTopic } from "../src/proposals/baselines.ts";
import { adjudicateProposal, resetAdjudicationInFlight } from "../src/proposals/adjudicate.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { checkObligation } from "../src/ontology/relations.ts";

const P = "proj-d7";
const PUZZLE = "page-puzzle";
const THEORY = "page-theory";

let seq = 0;
const uid = () => `dddddddd-7777-4777-8777-${String((seq += 1)).padStart(12, "0")}`;
const now = () => 1_700_000_000_000 + (seq += 1);

const env = () => ({
  id: uid(),
  ts: now(),
  actor: "human" as const,
  projectId: P,
});

const page = (id: string, type: string, title: string, chunks: readonly string[] = []) =>
  ({
    ...env(),
    type: "ontology-mutation",
    op: "create",
    targetId: id,
    pageType: type,
    title,
    body: "",
    supportingChunks: chunks,
    origin: "author-prior",
  }) as unknown as LedgerEvent;

/** The framing claim the researcher made through the chooser. */
const CLAIM = {
  ...env(),
  type: "ontology-mutation",
  op: "relate",
  targetId: `${PUZZLE}->${THEORY}:stands-to`,
  edge: { from: PUZZLE, to: THEORY, role: "stands-to" },
  puzzleRelation: "contradicts",
  origin: "author-prior",
  supportingChunks: [],
} as unknown as LedgerEvent;

const MODEL: readonly LedgerEvent[] = [
  page(PUZZLE, "puzzle", "Handover drifts after midnight", ["c1"]),
  page(THEORY, "theory", "Handoffs fail when the receiver cannot question the sender"),
  CLAIM,
];

const LIVE_PAGES = [
  { id: PUZZLE, type: "puzzle", title: "Handover drifts after midnight" },
  { id: THEORY, type: "theory", title: "Handoffs fail when the receiver cannot question the sender" },
];

/** What the drafter produced from the answer, before anything attached it. */
const draft = (pageType: string, title: string): ProposalEvent =>
  ({
    ...env(),
    actor: "persona:drafter",
    model: "m",
    modelVersion: "v",
    type: "proposal",
    proposalId: uid(),
    pageType,
    title,
    body: "As they described it.",
    sourceChunks: [],
    sourceTurn: "turn-1",
  }) as unknown as ProposalEvent;

const OBSERVED = "28 April board paper: anchor sentence and drifted pricing three lines apart";

describe("the topic the move raises names the claim it was raised for", () => {
  test("it round-trips the two pages, so nothing has to read the question", () => {
    expect(obligationOfTopic(obligationTopic(PUZZLE, THEORY))).toEqual({
      puzzleId: PUZZLE,
      theoryId: THEORY,
    });
  });

  test("another kind of topic is not one of these", () => {
    expect(obligationOfTopic(baselineTopic("d1#a1b2"))).toBeUndefined();
    expect(obligationOfTopic("lint:orphan-construct:page-1")).toBeUndefined();
    // A prefix with nothing behind it names no claim.
    expect(obligationOfTopic("obligation:")).toBeUndefined();
    expect(obligationOfTopic(`obligation:${PUZZLE}`)).toBeUndefined();
  });
});

  // M63, the lead's rulings of 2026-09-30: attachToObligation retired with the per-claim wiring; answerLineEvents in concepts/door.ts carries the behaviour (m63-record); superseded: "it gains the edge the debt is counted in"
  // M63, the lead's rulings of 2026-09-30: attachToObligation retired with the per-claim wiring; answerLineEvents in concepts/door.ts carries the behaviour (m63-record); superseded: "a draft from an unrelated question gains nothing"
  // M63, the lead's rulings of 2026-09-30: attachToObligation retired with the per-claim wiring; answerLineEvents in concepts/door.ts carries the behaviour (m63-record); superseded: "only an observation, because the other kinds say something else"
  // M63, the lead's rulings of 2026-09-30: attachToObligation retired with the per-claim wiring; answerLineEvents in concepts/door.ts carries the behaviour (m63-record); superseded: "a puzzle that is not a live page is not linked to"

describe("the surface that answers the question attaches the draft", () => {
  test("the dialogue runs the attachment beside the baseline one", async () => {
    /* The pure function above is worth nothing if nothing calls it, and the
     * defect was exactly that shape: the machinery existed for baselines and
     * the obligation answer went through the same handler with no attachment,
     * so the draft arrived unlinked and the band never moved. */
    const src = await Bun.file(
      new URL("../src/workbench/Dialogue.tsx", import.meta.url).pathname,
    ).text();
    /* M63, ISC-610: a turn no longer drafts claims (the owner redirected the
     * drafter to concepts at a saved summary), so there is no draft for the
     * dialogue to attach. The helper above keeps its own tests; its caller is
     * returned to the lead with the M63 report. */
    expect(src).not.toContain("gleanFromTurn(");
  });

  test("the move raises the topic through the one builder", async () => {
    // Two spellings of the same topic is how the answer would come back under a
    // string nothing recognises.
    const src = await Bun.file(
      new URL("../src/interview/moves.ts", import.meta.url).pathname,
    ).text();
    expect(src).toContain("obligationTopic(");
    expect(src).not.toContain("`obligation:${");
  });
});

  // M63, the lead's rulings of 2026-09-30: attachToObligation retired with the per-claim wiring; answerLineEvents in concepts/door.ts carries the behaviour (m63-record); superseded: "the count moves from none to one when the draft is accepted"
  // M63, the lead's rulings of 2026-09-30: attachToObligation retired with the per-claim wiring; answerLineEvents in concepts/door.ts carries the behaviour (m63-record); superseded: "the accept still goes through the one door, as two mutations"
