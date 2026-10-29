/**
 * Pressing "Draft what these papers expect" twice (walk finding).
 *
 * The second press read the same three papers again and staged eight
 * expectations, two or four per paper, with different titles from the first
 * pass. The only guard was a list of titles already in the model, and a model
 * asked the same question twice does not answer in the same words, so the guard
 * could never have fired.
 *
 * What makes a second reading worth anything is not that the button was
 * pressed. It is that the study has moved: the same paper against the same
 * framing holds the same expectations. So the framing is stamped on every
 * draft, and a paper is staged from again only when the stamp no longer
 * matches.
 *
 * M33: the defect is gone by construction and this file holds the property
 * that replaced it. There is one derivation, made when the paper is judged on
 * arrival, and the button stages what it wrote. A second press cannot produce a
 * differently-worded copy of an expectation because it produces no wording at
 * all. What each test asserts is unchanged; what it counts is staged drafts
 * rather than model calls, because there are no calls left to count.
 */

import { describe, expect, test } from "bun:test";
import { validateEvent, type LedgerEvent } from "../src/ledger/events.ts";
import { studyContext } from "../src/interview/studyContext.ts";
import { framingDigest, paperVerdicts } from "../src/proposals/paperFit.ts";
import {
  expectationsFrom,
  extractTheoryClaims,
  papersAlreadyRead,
} from "../src/proposals/theory.ts";
import {
  baselineId,
  baselinesSettled,
  paperBaselines,
  papersFullyStaged,
} from "../src/proposals/baselines.ts";
import { projectProposals } from "../src/proposals/projection.ts";
import {
  readPapersLabel,
  readPapersReason,
  readPapersScope,
} from "../src/flow/SeminalCorpus.tsx";
import { emptyBrief, type ProjectBrief } from "../src/state/projects.ts";
import type { Chunk, DocumentKind, StoredDocument } from "../src/state/chunks.ts";

const P = "proj-reread";
let seq = 0;
const uid = () => `bbbbbbbb-2222-4222-8222-${String((seq += 1)).padStart(12, "0")}`;

function chunk(id: string, documentId: string, index: number, kind: DocumentKind = "literature"): Chunk {
  return { id, projectId: P, documentId, kind, text: `passage ${id}`, index };
}
function doc(id: string, name: string): StoredDocument {
  return { id, projectId: P, name, kind: "literature", createdAt: 1, chunkCount: 1 };
}

const THORP = doc("doc-thorp", "thorp.pdf");
const BECHKY = doc("doc-bechky", "bechky-2003.pdf");
const CHUNKS: readonly Chunk[] = [chunk("t1", "doc-thorp", 0), chunk("b1", "doc-bechky", 0)];

const BRIEF: ProjectBrief = {
  ...emptyBrief(),
  startingInterest: "How night nurses hand a patient over",
  researchQuestion: "I expected agreement about the patient and found agreement about the form",
};

/**
 * The framing moved, which since D19b (M43d) means a field the researcher typed.
 *
 * It used to be `researchQuestion`, which is the tool's own reading of their
 * saved answers rather than anything they wrote, rewritten on every station save
 * and every read of the data. Moving it re-judged every paper in the study for a
 * change the researcher did not make.
 */
const MOVED: ProjectBrief = {
  ...BRIEF,
  startingInterest: "How night nurses hand a patient over, and what the form does to it",
};

/** The tool re-read the puzzle and the researcher typed nothing (D19b, M43d). */
const REREAD: ProjectBrief = {
  ...BRIEF,
  researchQuestion: "I expected the form to be a record and found it was the decision",
};

/**
 * The record as the arrival judge leaves it: one `paper-fit` event per paper,
 * each holding one expectation.
 *
 * The expectation carries the framing it was judged against, which is what a
 * re-judgement actually produces: the judge is handed the puzzle and the study,
 * so a moved framing yields different words. A different expectation per paper
 * on purpose too, because the staging refuses to write the same title twice and
 * two papers holding one expectation would make that guard indistinguishable
 * from the one under test.
 */
function judged(
  digest: string,
  papers: readonly StoredDocument[] = [THORP, BECHKY],
): readonly LedgerEvent[] {
  return papers.map(
    (d, i) =>
      ({
        id: uid(),
        ts: (seq += 1),
        actor: "system",
        projectId: P,
        model: "m",
        modelVersion: "v",
        type: "paper-fit",
        paperKey: d.id,
        paperName: d.name,
        verdict: "fits",
        reason: "It predicts what happens at shift boundaries.",
        framingDigest: digest,
        baselines: [
          {
            id: baselineId(d.id, `Handovers hold under shift work, from ${d.name}, against ${digest}`),
            expectation: `Handovers hold under shift work, from ${d.name}, against ${digest}`,
            scope: "on shift work and not in surgery",
            chunkId: i === 0 ? "t1" : "b1",
          },
        ],
      }) as LedgerEvent,
  );
}

/** What the Material section builds before it stages: the tray, as titles. */
const trayTitles = (events: readonly LedgerEvent[]): ReadonlySet<string> => {
  const tray = projectProposals(events, P);
  return new Set([...tray.pending, ...tray.accepted].map((p) => p.title.trim().toLowerCase()));
};

function stage(
  record: readonly LedgerEvent[],
  brief: ProjectBrief,
  documents: readonly StoredDocument[] = [THORP, BECHKY],
  chunks: readonly Chunk[] = CHUNKS,
) {
  const digest = framingDigest(studyContext(brief));
  /* The judge runs on arrival and on a framing save, so the record the button
   * reads already holds a verdict per paper against the framing as it stands.
   * Written here rather than passed as a bare map, so the test goes through the
   * same projection the surfaces do. */
  const events = [...record, ...judged(digest, documents)];
  const result = extractTheoryClaims({
    projectId: P,
    documents,
    chunks,
    verdicts: paperVerdicts(events, P),
    framingDigest: digest,
    skip: papersFullyStaged({
      baselines: paperBaselines(events, P),
      declined: baselinesSettled(events, P).declined,
      staged: trayTitles(events),
    }),
    existingTitles: [...trayTitles(events)],
    makeId: uid,
    now: () => (seq += 1),
  });
  for (const event of result.events) expect(validateEvent(event)).toEqual([]);
  return {
    staged: result.proposals.length,
    /** What this press wrote. */
    written: result.events,
    /** The record after it, to feed the next press. */
    record: [...events, ...result.events],
  };
}

describe("a paper is staged from once per framing", () => {
  test("the first press stages every paper and stamps the framing on each draft", () => {
    const first = stage([], BRIEF);
    expect(first.staged).toBe(2);
    const drafts = first.written.filter((e) => e.type === "proposal");
    expect(drafts.length).toBe(2);
    const digest = framingDigest(studyContext(BRIEF));
    for (const d of drafts) {
      expect((d as { framingDigest?: string }).framingDigest).toBe(digest);
    }
  });

  test("a second press with nothing changed stages nothing", () => {
    // The walk: three papers read twice, eight expectations staged.
    const first = stage([], BRIEF);
    const second = stage(first.record, BRIEF);
    expect({ staged: second.staged, written: second.written.length }).toEqual({
      staged: 0,
      written: 0,
    });
  });

  test("a framing change stages what the re-judgement newly expects", () => {
    /* M33: the framing change re-judges the papers, which is the arrival gate's
     * job, and what reaches the tray is whatever that judgement newly expects.
     * A re-judgement reaching the same expectation stages nothing, which is
     * right: there is no second wording of it any more. */
    const first = stage([], BRIEF);
    const second = stage(first.record, MOVED);
    expect(second.staged).toBe(2);
    expect(second.written.filter((e) => e.type === "proposal").length).toBe(2);
  });

  test("a re-read of the puzzle stages nothing, because nobody typed anything (D19b)", () => {
    /* The demo ledger of 2026-09-13 holds 65 paper-fit events for six papers and
     * eleven distinct digests, because the puzzle reading is rewritten by every
     * station save and every read of the data. Under the new digest the same
     * re-read is a different sentence about the same study. */
    const first = stage([], BRIEF);
    const second = stage(first.record, REREAD);
    expect({ staged: second.staged, written: second.written.length }).toEqual({
      staged: 0,
      written: 0,
    });
  });

  test("a paper added after the first press is staged, and the others are not", () => {
    const first = stage([], BRIEF);
    const added = doc("doc-new", "orlikowski-2002.pdf");
    const result = stage(
      first.record,
      BRIEF,
      [THORP, BECHKY, added],
      [...CHUNKS, chunk("n1", "doc-new", 0)],
    );
    expect(result.staged).toBe(1);
    expect(
      result.written
        .filter((e) => e.type === "proposal")
        .map((e) => (e as { paperKey?: string }).paperKey),
    ).toEqual(["doc-new"]);
  });

  test("a paper whose every draft was turned down is staged from again", () => {
    /* Turning a draft down is the researcher saying no to what the paper
     * produced, and asking again is a reasonable thing for them to want. Only a
     * draft still waiting, or a claim already accepted, counts as read. */
    const first = stage([], BRIEF);
    const drafts = first.written.filter((e) => e.type === "proposal");
    const rejections: LedgerEvent[] = drafts.map((d) => ({
      id: uid(),
      ts: (seq += 1),
      actor: "human",
      projectId: P,
      type: "proposal-adjudication",
      proposalId: (d as { proposalId: string }).proposalId,
      disposition: "reject",
      reason: "not the conversation I am joining",
    })) as LedgerEvent[];
    const after = stage([...first.record, ...rejections], BRIEF);
    expect(after.staged).toBe(2);
  });
});

describe("what the record says each paper produced", () => {
  test("drafts are counted per paper, pending or accepted", () => {
    const first = stage([], BRIEF);
    const counts = papersAlreadyRead(first.record, P);
    expect([...counts].map(([key, v]) => [key, v.drafts])).toEqual([
      ["doc-thorp", 1],
      ["doc-bechky", 1],
    ]);
  });

  test("the row says it in words, singular and plural", () => {
    expect(expectationsFrom(1)).toBe("1 expectation drafted");
    expect(expectationsFrom(2)).toBe("2 expectations drafted");
  });
});

/**
 * What the control says it does (D20, M43b).
 *
 * It had two labels. "Draft what these papers expect" while anything was left to
 * stage, and "Read the papers again" once everything was staged, which described
 * a model call this control has not made since M33 and only ever appeared on the
 * inert form. The walk of 2026-09-13 read the first as an offer to read one
 * paper, pressed it for the paper showing no expectations, and got all seven
 * expectations of the other four staged and every row's accept and turn-down
 * control removed.
 *
 * One label, in the imperative, naming whose expectations and how many papers.
 * The line beside it says the row controls go and where the deciding happens.
 */
describe("the control says what pressing it does (D20)", () => {
  test("one label, in both states, and it says every paper", () => {
    expect(readPapersLabel(2, 3)).toBe("Suggest expectations");
    expect(readPapersLabel(0, 3)).toBe("Suggest expectations");
    expect(readPapersLabel(0, 0)).toBe("Suggest expectations");
    expect(readPapersReason(3, 2)).toBeNull();
  });

  test("the line says the row controls go, and where the deciding happens", () => {
    const line = readPapersScope(2, 3);
    expect(line).toContain("One press adds one to three expectations per paper to your suggestions");
    expect(line).toContain("to your suggestions on the Emerging project ontology tab");
    expect(line).toContain("and the buttons on each paper's row go away");
    /* The reading the walk took from it: that the row controls stay and the press
     * only puts the expectations in front of you. */
    expect(line).not.toContain("in front of you");
  });

  test("with everything staged the line says so, and what would bring more", () => {
    expect(readPapersScope(0, 3)).toBe(
      "Every paper's expectations are already in your suggestions.",
    );
    expect(readPapersReason(3, 0)).toBe(
      "Add a paper to get more suggestions.",
    );
  });

  test("with no papers at all the sentence is still the one about naming a paper", () => {
    expect(readPapersReason(0, 0)).toContain("Identify or upload a paper first.");
  });

  test("no surface says the control reads one paper", () => {
    for (const line of [
      readPapersScope(2, 3),
      readPapersScope(0, 3),
      readPapersReason(0, 0) ?? "",
      readPapersReason(3, 0) ?? "",
      readPapersLabel(2, 3),
    ]) {
      expect(line).not.toMatch(/\bread (?:the|this) paper\b/i);
    }
  });
});
