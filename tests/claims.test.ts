/**
 * Claims about state must be guarded by the state (ISC-258, ISC-259).
 *
 * Three of the worst defects found on the first real walk through this app
 * were the same defect wearing different clothes.
 *
 *   - The landing page said the tool "builds your own model of the phenomenon
 *     as you answer". Answering built nothing.
 *   - The twin panel said a baseline "was generated from your brief and has
 *     been sitting unread", in the branch that renders when no baseline
 *     exists.
 *   - The station card put a question in large type above a textarea that
 *     answered a different question.
 *
 * Every one passed the full suite, because the copy is tested and the wiring
 * is tested and nothing tests that they agree. Prose is not covered by types
 * and does not throw. The class is: a sentence asserts that something exists
 * or has happened, and nothing binds that sentence to the condition that would
 * make it true.
 *
 * A general checker is not possible — this is natural language. What is
 * possible is a registry: every user-facing sentence that asserts a generated
 * artifact is listed here with the predicate that must hold where it renders,
 * and the test asserts both that the sentence is still in the source it claims
 * to be in and that the guard is still next to it. Adding such a sentence
 * without registering it is the thing this catches, because the scan below
 * fails on any unregistered match.
 */

import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

const SRC = new URL("../src/", import.meta.url).pathname;

interface Claim {
  /** File the sentence lives in. */
  readonly file: string;
  /** A distinctive fragment of the sentence, verbatim. */
  readonly says: string;
  /** Source fragment that must appear in the same file: the guard on the claim. */
  readonly guardedBy: string;
  /** Why this sentence is allowed to make its assertion. */
  readonly because: string;
}

const CLAIMS: readonly Claim[] = [
  {
    file: "workbench/TwinPanel.tsx",
    // M28: copy. The sentence leads on what the reader gets rather than on the
    // absence of a file, and it is still the branch that renders when there is
    // no twin, so it still promises a thing that does not exist yet.
    // ISC-596 (L13): named, not "See how".
    says: "See the design an ordinary, by-the-book version of this project would have had",
    guardedBy: "twin === null",
    because:
      "It renders only when no twin is stored, so it offers to write one rather than describing one that already exists.",
  },
  {
    file: "workbench/TwinPanel.tsx",
    // M28: copy. Same guarantee, saying "your model" for the ontology.
    // M29 (A6): the guarantee moved with the inputs. The corpus count left the
    // twin context and the accepted expectations arrived, so the sentence now
    // claims what the call actually does: framing plus theory claims, and no
    // other page of the graph.
    // M42: the sentence names the ordinary version rather than opening the
    // clause on "it", and it wraps, so the registered fragment stops at the
    // line break. The claim and its guard are unchanged.
    says: "Abductive writes the ordinary version only from your starting point",
    guardedBy: "generateAndStoreTwin({ project, claims, client })",
    because:
      "The generator is passed the project and the accepted theory claims and never the graph, so every other page of the model stays independent of the thing being compared.",
  },
  /* M42 registered "Abductive wrote every claim and flag in the example" on
   * ui/BringInStudy.tsx; M86 (ISC-719, the owner, 2026-10-14) replaced the
   * sentence with one that makes no claim about who wrote the example, so the
   * entry went with it. README.md still said it until 2026-10-14 (M91), when
   * the owner removed the example project and that paragraph went too. Retired
   * 2026-10-14: no entry in this registry is example copy now. */
  {
    file: "ui/Introduction.tsx",
    // M28: copy.
    // M42: the sentence took a contraction. What it claims, and the wiring that
    // makes the claim true, are unchanged.
    // M61 follow-up (ISC-586): the owner's wording adds "then". Same claim.
    says: "Your answers then build a model of what you're studying",
    guardedBy: "",
    because:
      "True since drafting runs on every answer; the wiring is asserted separately in glean.test.ts and flow.test.ts.",
  },
  /* ISC-595 (owner, 2026-09-30; two since M89): the governance section states three things the
   * product does, in the affirmative, so each is registered with what makes it
   * true. They sit in COMMITMENTS, read by the front page and the walkthrough. */
  {
    file: "ui/Introduction.tsx",
    says: "Abductive logs authorship for each recorded claim",
    guardedBy: "",
    because:
      "Every claim is filed with an origin mark by the proposal door (proposals/adjudicate.ts), and editing a suggestion does not relabel it; tests/origin-boundary.test.ts holds the mark fixed.",
  },
  {
    file: "ui/Introduction.tsx",
    says: "Abductive keeps your choices in History",
    guardedBy: "",
    because:
      "An I don't know and a change of subject are each appended as their own event (a refusal, a redirection) and shown in History; nothing removes them. The Not now and set-aside events written before M69 stay on the record and still render (tests/m69-controls.test.ts).",
  },
  /* Retired 2026-10-14 (M89): "Abductive keeps contradictions visible" was the
   * third governance card, and its guard was the checks (a flag stays open
   * until dismissed; the residue checks in lint/structural.ts). The owner
   * tabled the checks that day and the card went with them. */
  /* ISC-592 (lead's ruling, 2026-09-30): "Suggest starting point" drafts all
   * three Starting point answers in one call, so the owner's two sentences are
   * true. The rule the draft keeps is the one the interest's always kept, now
   * for each of the three: made from the researcher's own turns and nothing
   * else, a part never said comes back as the marked gap and is never saved,
   * each draft lands marked as a suggestion, each save names its draft, and one
   * brief-draft event per field is written whether or not the text is kept
   * (tests/m61-framing-draft.test.ts). */
  /* M62, ISC-600: both sentences moved into Starting point's Help panel, and
   * the first reads as summaries now (ISC-597, ISC-598). The guard is the
   * same draft in FramingBand.tsx, which tests/m61-framing-draft.test.ts and
   * tests/m62-framing-parts.test.ts drive. */
  {
    file: "ui/pageHelp.ts",
    // M74b, ISC-664: the summary's length and what it keeps, in the same claim.
    // M92, ISC-752: one summary per press of Auto-generate summary from chat.
    says: "Auto-generate summary from chat writes one summary in two to five sentences from your replies, keeps your phrasing, and leaves out your questions and asides.",
    guardedBy: "",
    because:
      "The draft asks for the one part under the control (three parts in one call until M92) and lands it in its own field unsaved and marked; the researcher edits it or presses Save answer, and only then does it enter the record, naming its draft. A part the conversation never covered is the marked gap, shown and never saved; an unsaved suggestion comes back from its brief-draft event after a reload.",
  },
  /* M62, ISC-598: the control reads Summarise, and the fields are summaries. */
  {
    file: "ui/pageHelp.ts",
    says: "Auto-generate summary from chat turns this conversation into the summary above the control.",
    guardedBy: "",
    because:
      "Each summary's own control drafts that summary from the researcher's own turns at Starting point, one brief-draft event for the field, whether or not the text is kept (tests/m92-pages.test.tsx).",
  },
];

describe("every claim names its guard", () => {
  for (const claim of CLAIMS) {
    test(`${claim.file}: "${claim.says.slice(0, 44)}…"`, async () => {
      const text = await Bun.file(SRC + claim.file).text();
      expect(text).toContain(claim.says);
      if (claim.guardedBy !== "") expect(text).toContain(claim.guardedBy);
      expect(claim.because.length).toBeGreaterThan(20);
    });
  }
});

/**
 * The past tense is what made the twin sentence false: "was generated", "has
 * been sitting". A claim in the past tense about an artifact is a claim that
 * something already happened, and it is the shape that cannot be true in an
 * empty-state branch. Present and future tense make no such claim.
 */
const PAST_TENSE_ASSERTION =
  /\b(was|were|has been|have been)\s+(generated|created|written|built|stored|prepared|computed)\b/i;

describe("no unregistered past-tense claim about a generated artifact (ISC-258)", () => {
  test("scan of every component", async () => {
    const registered = CLAIMS.map((c) => c.says);
    const offenders: string[] = [];
    for await (const rel of new Glob("**/*.tsx").scan(SRC)) {
      const raw = await Bun.file(SRC + rel).text();
      // Comments explain the code, including this defect's own history, and
      // are not shown to anyone. Only rendered prose is in scope.
      const text = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const line of text.split("\n")) {
        if (!PAST_TENSE_ASSERTION.test(line)) continue;
        if (registered.some((s) => line.includes(s))) continue;
        offenders.push(`${rel}: ${line.trim().slice(0, 90)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("Anti: the scan is not vacuous", () => {
    expect(PAST_TENSE_ASSERTION.test("A version of this study was generated from your brief.")).toBe(
      true,
    );
    expect(PAST_TENSE_ASSERTION.test("Ask for one and a baseline gets written from your brief.")).toBe(
      false,
    );
  });
});

describe("the station prompt labels the field it belongs to (ISC-260, ISC-262)", () => {
  test("the prompt is a label bound to the station input", async () => {
    const text = await Bun.file(SRC + "flow/StationWorkspace.tsx").text();
    expect(text).toContain(`<label htmlFor="station-input">{station.prompt}</label>`);
    expect(text).toContain(`id="station-input"`);
  });

  /* ISC-261 moved file at M27 (D2) and lost its box at M40 (ISC-508).
   *
   * The criterion was that the puzzle had a visible label of its own rather than a
   * heading somewhere above it pointing at a different box. It was inside a
   * `<details>` on the Context station, labelled "Your research question, as you
   * would state it today"; then it was the second field of the Framing band,
   * asking for the puzzle rather than for a question.
   *
   * There is no box now, so there is no `for` to assert: the puzzle is the tool's
   * reading of the saved answers, shown read-only. What the criterion was
   * protecting survives the removal and is what is asserted instead — the reader
   * can tell what the text under the heading is, and nothing above it names a
   * different thing. The heading names it, the line under it says where it was read
   * from, and a third sentence says the words are the tool's. A label with no
   * control is a `<p className="field-label">` rather than a `<label>`, because a
   * `<label>` pointing at nothing is the defect ISC-261 was written for arriving
   * from the other direction.
   *
   * The interest field above it keeps the original claim, and it is asserted here
   * so the block is not reduced to a test of an absence. */
  /* ISC-587 (M61 follow-up): the read block left Starting point for the Puzzle
   * step, where the step's own label names it. What stays asserted here is the
   * half ISC-261 was about on this page: no box, no stray label, and the interest
   * keeps its own. */
  test("the puzzle has no box and no label on Starting point, and the interest keeps its label (ISC-261, ISC-587)", async () => {
    const text = await Bun.file(SRC + "flow/FramingBand.tsx").text();
    // No box, no question, no `for` pointing at one.
    expect(text).not.toContain("htmlFor={FRAMING_PUZZLE_FIELD}");
    expect(text).not.toContain("What did you expect to find here, and what did you find instead?");
    // And no read block either: the puzzle is shown at its step.
    expect(text).not.toContain("Suggested puzzle");
    expect(text).not.toContain("FRAMING_PUZZLE_ID");
    // The field that is still a field still carries its own visible label.
    expect(text).toContain('htmlFor="framing-starting-interest"');
    // M62, ISC-599: the question is written once, with the framing's probes, and
    // the field prints it as its help line.
    expect(text).toContain("{FRAMING_QUESTION.startingInterest}");
    const probes = await Bun.file(SRC + "interview/stationProbes.ts").text();
    expect(probes).toContain('startingInterest: "What is drawing you to this particular research inquiry?"');
    // Not a `visually-hidden` span standing in for a label, which is what the
    // station field had while the visible heading pointed at the wrong box.
    expect(text).not.toContain(`<span className="visually-hidden">`);
    // And the station card no longer holds any framing field at all.
    const station = await Bun.file(SRC + "flow/StationWorkspace.tsx").text();
    expect(station).not.toContain("station-research-question");
    expect(station).not.toContain("StudyFraming");
  });

  test("the dialogue answer box has an accessible name (ISC-263)", async () => {
    /* The id became per-instance at M37 and the claim did not move.
     *
     * Two conversations can be on screen at once now, the step's and the
     * framing's, and a fixed id meant the second box shared it. Two elements
     * with one id is one accessible name between them: `for` binds to the first
     * and the second textarea has none, which is the defect this test exists to
     * catch, arriving by duplication rather than by omission. */
    const text = await Bun.file(SRC + "workbench/Dialogue.tsx").text();
    expect(text).toContain("const answerId = `answer-input-${uid}`");
    expect(text).toContain("htmlFor={answerId}");
    expect(text).toContain("id={answerId}");
    // And nothing writes the bare id any more, in either half of the pair.
    // The test id stays fixed: it names the control for the keyboard model and
    // for the tests, and it is not what a screen reader reads.
    expect(text).not.toContain(`htmlFor="answer-input"`);
    expect(text).not.toContain(` id="answer-input"`);
    expect(text).toContain(`data-testid="answer-input"`);
  });
});
