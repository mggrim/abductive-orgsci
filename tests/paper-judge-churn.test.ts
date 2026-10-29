/**
 * The paper judge stops re-running on the tool's own reading (D19b, M43d).
 *
 * `framingDigest` covered the exploring text and the puzzle. The puzzle looked
 * like a framing field when it was one; since M40 it is the tool's own reading of
 * the researcher's saved answers, rewritten whenever any saved answer moves and
 * whenever the three most-opened passages change, and the passages are ordered by
 * attention events the tool's own reads write. So every station save and every
 * press of "Read your data" moved the digest, and a moved digest re-judges every
 * paper in the study with no researcher input at all.
 *
 * The demo ledger of 2026-09-13 holds 65 `paper-fit` events for six papers across
 * eleven distinct digests, with verdicts flipping in between: Csaszar misfit to
 * fits to unclear, Huang fits to unclear to misfit, Cohen unclear to fits to
 * misfit. Each flip is a model call spent to contradict the last one, and each one
 * changes what the researcher is told about their reading list.
 *
 * The rule now: a paper is judged when it arrives, when the researcher changes one
 * of the three fields they type into the framing band, and once when the puzzle
 * goes from empty to stated. Decision by the orchestrator on 2026-09-13, to be
 * confirmed by the owner.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { framingDigest, papersNeedingJudgement, paperVerdicts } from "../src/proposals/paperFit.ts";
import { studyContext } from "../src/interview/studyContext.ts";
import { emptyBrief, type ProjectBrief } from "../src/state/projects.ts";

const BASE: ProjectBrief = {
  ...emptyBrief(),
  startingInterest: "How a pre-seed programme reads a founder's weekly update",
  seminalCorpus: "Hallen 2008. Cohen, Bingham and Hallen 2019.",
  targetVenue: "Academy of Management Journal",
  researchQuestion: "You expected the tool to level the field and found a new criterion instead.",
};

const digestOf = (brief: ProjectBrief) => framingDigest(studyContext(brief));

describe("what moves the digest", () => {
  test("each of the three fields the researcher types moves it", () => {
    const base = digestOf(BASE);
    expect(digestOf({ ...BASE, startingInterest: "Something else" })).not.toBe(base);
    expect(digestOf({ ...BASE, seminalCorpus: "Clough 2019." })).not.toBe(base);
    expect(digestOf({ ...BASE, targetVenue: "Organization Science" })).not.toBe(base);
  });

  test("a re-reading of the puzzle does not, however differently it is worded", () => {
    const base = digestOf(BASE);
    const reread = digestOf({
      ...BASE,
      researchQuestion:
        "You expected Pitchwright to level the field, and the programme wrote a fifth line onto the sheet.",
    });
    expect(reread).toBe(base);
  });

  test("the puzzle going from empty to stated does move it, once", () => {
    const empty = digestOf({ ...BASE, researchQuestion: "" });
    const stated = digestOf(BASE);
    expect(empty).not.toBe(stated);
    // And every later reading lands on the same digest as the first.
    expect(digestOf({ ...BASE, researchQuestion: "A third reading of the same study." })).toBe(
      stated,
    );
  });

  test("reformatting a field is not a change", () => {
    expect(digestOf({ ...BASE, startingInterest: `  HOW a pre-seed  programme reads a founder's weekly update ` })).toBe(
      digestOf(BASE),
    );
  });

  test("two studies cannot collide by running their fields together", () => {
    const a = digestOf({ ...BASE, startingInterest: "one", seminalCorpus: "two" });
    const b = digestOf({ ...BASE, startingInterest: "one two", seminalCorpus: "" });
    expect(a).not.toBe(b);
  });
});

describe("what the judge does with it", () => {
  const papers = [
    { key: "hallen 2008", name: "Hallen 2008" },
    { key: "cohen 2019", name: "Cohen, Bingham and Hallen 2019" },
  ];

  function judgedAt(digest: string): readonly LedgerEvent[] {
    return papers.map((paper, i) => ({
      id: `fit-${i}`,
      ts: 1000 + i,
      actor: "system",
      projectId: "p",
      type: "paper-fit",
      paperKey: paper.key,
      paperName: paper.name,
      verdict: "fits",
      reason: "",
      framingDigest: digest,
      baselines: [],
    })) as LedgerEvent[];
  }

  test("nothing is due after a re-reading of the puzzle", () => {
    const record = judgedAt(digestOf(BASE));
    const due = papersNeedingJudgement({
      papers,
      verdicts: paperVerdicts(record, "p"),
      digest: digestOf({ ...BASE, researchQuestion: "A fresh reading, the same study." }),
    });
    expect(due).toEqual([]);
  });

  test("every paper is due after a venue change", () => {
    const record = judgedAt(digestOf(BASE));
    const due = papersNeedingJudgement({
      papers,
      verdicts: paperVerdicts(record, "p"),
      digest: digestOf({ ...BASE, targetVenue: "Organization Science" }),
    });
    expect(due.map((p) => p.key)).toEqual(["hallen 2008", "cohen 2019"]);
  });

  test("every paper is due once when the puzzle is first stated", () => {
    const record = judgedAt(digestOf({ ...BASE, researchQuestion: "" }));
    const verdicts = paperVerdicts(record, "p");
    expect(papersNeedingJudgement({ papers, verdicts, digest: digestOf(BASE) })).toHaveLength(2);
    // And the reading after that one is due nothing.
    const settled = judgedAt(digestOf(BASE));
    expect(
      papersNeedingJudgement({
        papers,
        verdicts: paperVerdicts(settled, "p"),
        digest: digestOf({ ...BASE, researchQuestion: "The second reading." }),
      }),
    ).toEqual([]);
  });
});

const BUNDLE = await Bun.file(
  new URL("./fixtures/coldharbour.bundle.json", import.meta.url).pathname,
).json();

describe("the demo ledger, under the old rule and the new one", () => {
  const EVENTS: readonly LedgerEvent[] = BUNDLE.events;
  const fits = EVENTS.filter((e) => e.type === "paper-fit");

  test("65 judgements over six papers, across eleven distinct framings", () => {
    expect(fits).toHaveLength(65);
    expect(new Set(fits.map((e) => (e as { paperKey: string }).paperKey)).size).toBe(6);
    expect(new Set(fits.map((e) => (e as { framingDigest: string }).framingDigest)).size).toBe(11);
  });

  test("the exploring half never moved, so every one of the eleven is a re-reading", () => {
    /* The old digest is the exploring text, a space, and the puzzle. Every
     * recorded digest shares the same opening run, which is the exploring text,
     * so the eleven differ only in the half the tool writes. */
    const digests = [...new Set(fits.map((e) => (e as { framingDigest: string }).framingDigest))];
    let prefix = digests[0] ?? "";
    for (const d of digests) {
      let i = 0;
      while (i < prefix.length && i < d.length && prefix[i] === d[i]) i += 1;
      prefix = prefix.slice(0, i);
    }
    expect(prefix.length).toBeGreaterThan(1000);
  });

  test("under the new rule the same study would judge 11 times, not 65", () => {
    /* One judgement per paper on arrival, plus one more for each paper that was
     * first judged before the tool had read a puzzle and again after. Five of the
     * six were; the sixth was uploaded after the puzzle was stated. */
    const digests = [...new Set(fits.map((e) => (e as { framingDigest: string }).framingDigest))];
    let prefix = digests[0] ?? "";
    for (const d of digests) {
      let i = 0;
      while (i < prefix.length && i < d.length && prefix[i] === d[i]) i += 1;
      prefix = prefix.slice(0, i);
    }
    const byPaper = new Map<string, boolean[]>();
    for (const e of fits) {
      const row = e as { paperKey: string; framingDigest: string };
      const stated = row.framingDigest.slice(prefix.length).trim() !== "";
      byPaper.set(row.paperKey, [...(byPaper.get(row.paperKey) ?? []), stated]);
    }
    let total = 0;
    for (const states of byPaper.values()) {
      let transitions = 0;
      for (let i = 1; i < states.length; i += 1) {
        if (states[i] === true && states[i - 1] === false) transitions += 1;
      }
      total += 1 + transitions;
    }
    expect(total).toBe(11);
  });

  test("and the verdict flips the 54 removed calls produced are on the record", () => {
    const byPaper = new Map<string, Set<string>>();
    for (const e of fits) {
      const row = e as { paperKey: string; verdict: string };
      byPaper.set(row.paperKey, new Set([...(byPaper.get(row.paperKey) ?? []), row.verdict]));
    }
    // Three papers hold all three verdicts across the run, which is the judge
    // contradicting itself with no researcher input in between.
    const contradictory = [...byPaper.values()].filter((v) => v.size === 3);
    expect(contradictory.length).toBeGreaterThanOrEqual(3);
  });
});
