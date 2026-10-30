import { describe, expect, test } from "bun:test";

/*
 * M48. The scan itself moved to `copyBarScan.ts` so one definition of the
 * scope, the prose extractor and every check can be read by two callers: this
 * file, which asserts them, and `scratchpad/copy-offenders.ts`, which prints
 * the count per check while a sweep is under way. A `bun:test` file cannot be
 * imported by a plain `bun run` script ("Cannot use describe outside of the
 * test runner"), so a second copy of the checks in the script was the only
 * alternative, and a second copy of an allowlist is how an allowlist and the
 * strings it exempts come apart.
 */
import {
  AI_WORDS,
  APPOSITIVE_NOT,
  BARE_PRONOUN_OPENER,
  BARE_REFERENCE_ALLOW,
  bareReferenceOffenders,
  FILES,
  HEDGES,
  HISTORY,
  NOMINALISATIONS,
  NOT_X_ITS_Y,
  offenders,
  ONE_WORD_SENTENCE,
  patternOffenders,
  PAYOFF,
  proseRuns,
  sentencesOf,
  TRANSITION_OPENERS,
  bareReferences,
} from "./copyBarScan.ts";

describe("the copy bar, on every surface a researcher reads (M28)", () => {
  test("no banned nominalisation reaches a rendered string (C3)", () => {
    expect(offenders(NOMINALISATIONS)).toEqual([]);
  });

  test("no defensive hedge names a fear in order to allay it", () => {
    expect(offenders(HEDGES)).toEqual([]);
  });

  test("no sentence tells the researcher about a previous build (C5)", () => {
    expect(offenders(HISTORY)).toEqual([]);
  });

  /* The owner's guide (docs/copy-standard.md part 3), 2026-09-12. */
  test("no word from the AI vocabulary reaches a rendered string", () => {
    expect(offenders(AI_WORDS)).toEqual([]);
  });

  test("no rendered string opens a sentence on a transition adverb", () => {
    expect(patternOffenders(TRANSITION_OPENERS)).toEqual([]);
  });

  test("no rendered string reframes with 'It's not X. It's Y.'", () => {
    expect(patternOffenders(NOT_X_ITS_Y)).toEqual([]);
  });

  test("no rendered string reframes with 'X, not Y.'", () => {
    expect(patternOffenders(APPOSITIVE_NOT)).toEqual([]);
  });

  test("no rendered string tacks on a 'That's the…' payoff", () => {
    expect(patternOffenders(PAYOFF)).toEqual([]);
  });

  test("no rendered string carries a one-word sentence", () => {
    expect(patternOffenders(ONE_WORD_SENTENCE)).toEqual([]);
  });

  test("no rendered string opens a statement on a bare pronoun (C9)", () => {
    expect(patternOffenders(BARE_PRONOUN_OPENER)).toEqual([]);
  });

  test("no rendered string carries an em dash", () => {
    expect(patternOffenders(/—/)).toEqual([]);
  });

  /* C9's second half, M48. The owner, 2026-09-13: "I'm still seeing a bunch of
   * ambiguous language and pronoun usage 'holds it up' 'pushes against it' 'The
   * drawing is the shape.' So many uses of the words 'it' 'them' 'what'." Every
   * one of those passes the opener check above, because the pronoun is not the
   * sentence's subject. The reasoning and the rule are in `copyBarScan.ts`. */
  test("no rendered string leaves a pronoun with nothing to point at (C9)", () => {
    expect(bareReferenceOffenders()).toEqual([]);
  });

  test("Anti: the bare-reference check catches the owner's own three examples", () => {
    expect(bareReferences("Holds it up")).toEqual(["it"]);
    expect(bareReferences("Pushes against it")).toEqual(["it"]);
    expect(bareReferences("Nothing here yet.")).toEqual(["here"]);
    /* And the limit, on the record rather than implied. The third string the
     * owner quoted was "The names do not fit here without overlapping. The
     * drawing is the shape": the first sentence names a noun before "here", so
     * the rule clears it, and "here" still meant the drawing rather than the
     * names. A sentence-scoped determiner rule cannot tell which of two nouns a
     * pronoun took. The check is the floor; the reading is the bar, which is
     * what `docs/copy-standard.md` says in its first paragraph. */
    expect(bareReferences("The names do not fit here without overlapping.")).toEqual([]);
    expect(bareReferences("Run them again to see where you stand now.")).toEqual(["them"]);
    expect(bareReferences("Saturated on what?")).toEqual(["what"]);
    // And the shapes it must not fire on, each one a real string in src/.
    expect(bareReferences("Holds a claim up")).toEqual([]);
    expect(bareReferences("Put the draft in and the draft becomes a claim above.")).toEqual([]);
    expect(bareReferences("There's more in the setting than you can hold in view at once.")).toEqual(
      [],
    );
    expect(bareReferences("What's the process you're following?")).toEqual([]);
    /* The shape the noun-phrase rule deliberately does not clear: a capitalised
     * noun with no determiner. Widening it to accept one let "Pushes against it"
     * through, so the two prompt sentences that read this way were rewritten
     * instead ("A qualitative study earns a place by producing theory"). */
    expect(bareReferences("Qualitative work earns its keep by producing theory.")).toEqual(["its"]);
    expect(bareReferences("A qualitative study earns a place by producing theory.")).toEqual([]);
    expect(bareReferences('You haven\'t answered what "Bechky 2006" expects.')).toEqual([]);
    expect(bareReferences("argument-which-puzzle small muted")).toEqual([]);
    // A pronoun after the noun it points at is what C9 allows outright.
    expect(bareReferences("Bound a claim and you keep the claim without over-claiming it.")).toEqual(
      [],
    );
  });

  test("Anti: the allowlist is short, and every line on it is still a rendered string", () => {
    /* The M48 brief's ceiling: past forty lines the check would be wrong rather
     * than the strings, and the answer would be to narrow the check. Holding the
     * count here is what makes that a rule rather than an intention. */
    expect(BARE_REFERENCE_ALLOW.length).toBeLessThanOrEqual(40);
    // An exemption for a string nothing renders any more is an exemption that
    // hides the next offender that happens to match it.
    const all = FILES.map((f) => f.text).join("\n");
    const stale = BARE_REFERENCE_ALLOW.filter((s) => !all.includes(s));
    expect(stale).toEqual([]);
  });

  test("Anti: the scan still reads prose, and the sentence split is the unit", () => {
    expect(sentencesOf("One. Two? Three!")).toEqual(["One.", "Two?", "Three!"]);
    // The same pronoun is judged per sentence, so a noun in the sentence before
    // does not clear the one after it. That is the owner's stranger test.
    expect(bareReferences("The tool raises a finding. You can clear it.")).toEqual(["it"]);
    expect(bareReferences("The tool raises a finding you can clear.")).toEqual([]);
  });

  test("Anti: each new check catches the shape it is for", () => {
    expect(TRANSITION_OPENERS.test("You save it. Moreover, the checks read it.")).toBe(true);
    expect(NOT_X_ITS_Y.test("This is not a verdict. It's a reading.")).toBe(true);
    expect(APPOSITIVE_NOT.test("The line is an observation, not a diagnosis.")).toBe(true);
    expect(PAYOFF.test("The record keeps every turn. That's the whole point.")).toBe(true);
    expect(ONE_WORD_SENTENCE.test("The draft lands in the box. Done.")).toBe(true);
    expect(BARE_PRONOUN_OPENER.test("It reads the puzzle from your answers.")).toBe(true);
    expect(BARE_PRONOUN_OPENER.test("This is the tool's reading.")).toBe(true);
    // And lets the shapes it is not for through.
    expect(BARE_PRONOUN_OPENER.test("What is drawing you to this?")).toBe(false);
    expect(BARE_PRONOUN_OPENER.test("This step is about your setting.")).toBe(false);
    // M42: a label is not a statement. The ledger's two column headings are
    // "What happened" and "What the event changed"; the first ends at the verb,
    // so there is no sentence whose subject went unnamed. A pronoun opener that
    // goes on to say something is still caught, which the two cases above hold.
    expect(BARE_PRONOUN_OPENER.test("What happened")).toBe(false);
    expect(BARE_PRONOUN_OPENER.test("What happened here is your own doing.")).toBe(true);
    expect(APPOSITIVE_NOT.test("You can skip a question without creating a gap.")).toBe(false);
  });

  test("Anti: the scan reads the files it claims to read", () => {
    // Vacuity guard. A scan over an empty file list passes every assertion
    // above, which is the failure mode a source-text test has.
    expect(FILES.length).toBeGreaterThan(25);
    const paths = FILES.map((f) => f.path);
    for (const required of [
      "ui/Introduction.tsx",
      /* M89: "ui/CoherenceView.tsx" went with the checks. */
      "ui/ConceptsView.tsx",
      "ui/StudyViews.tsx",
      "flow/stations.ts",
      "flow/FramingBand.tsx",
      // M40. The band's puzzle block and the fold's own line are written here.
      "flow/usePuzzleReading.ts",
      "views/puzzleReading.ts",
      "workbench/ProposalsTrayView.tsx",
      "workbench/ExportBar.tsx",
      "auth/AuthPanel.tsx",
      "index.html",
    ]) {
      expect({ required, present: paths.includes(required) }).toEqual({ required, present: true });
    }
    // And it really does pull prose out of them, rather than an empty array
    // that would make every assertion above vacuous twice over.
    const total = FILES.reduce((n, f) => n + proseRuns(f.text).length, 0);
    expect(total).toBeGreaterThan(500);
  });

  test("Anti: it catches an offender in either population", () => {
    const jsx = '<p>Both declinations are written to the record.</p>';
    const literal = 'const note = "It costs you nothing to say so.";';
    expect(proseRuns(jsx).some((r) => /\bdeclinations\b/.test(r))).toBe(true);
    expect(proseRuns(literal).some((r) => /costs you nothing/.test(r))).toBe(true);
  });

  test("Anti: it ignores the identifiers that share the banned vocabulary", () => {
    // Every one of these is live in src/ and none of them is prose. A scan that
    // fired on them would be turned off inside a week, which is why the rule is
    // whitespace rather than a hand-kept exemption list.
    const code = [
      'import { runIntervention } from "../personas/engine.ts";',
      'import { projectOntology } from "../ontology/projection.ts";',
      'if (e.type !== "finding-disposition") continue;',
      'const LAYER: Record<"retrieval" | "citation", string> = {};',
      'disposition: "accept" | "reject" | "merge" | "defer",',
      'export type StationDeclination = "not-yet" | "not-applicable";',
      'adjudication: "your decision",',
    ].join("\n");
    for (const run of proseRuns(code)) {
      for (const word of NOMINALISATIONS) {
        expect({ run, word, hit: new RegExp(`\\b${word}\\b`, "i").test(run) }).toEqual({
          run,
          word,
          hit: false,
        });
      }
    }
  });

  test("Anti: a comment is not the tool speaking", () => {
    // The history of every one of these defects is written down in the file it
    // was fixed in, which is the only place it belongs. A scan that read
    // comments would force the record out of the source.
    const commented = [
      "// An earlier version relabelled a draft you edited as your own prior.",
      "/* Both declinations are written to the record, and neither is counted",
      "   against you. */",
    ].join("\n");
    expect(proseRuns(commented)).toEqual([]);
  });
});

/* M89 (2026-10-14): "a rule that fired on many things reads as one row" pinned
 * the fold of repeated flags on Checks (`findingRows`), which went with the
 * checks. */

/**
 * The two R4 rules that are behaviour rather than wording.
 *
 * Both were flow failures the copy could not fix on its own: a block that
 * asked the reader to choose among three research questions before they had
 * typed a word, and an empty state whose instruction was arithmetically wrong
 * on the study that reads it first.
 */
describe("the interview offers one question, and the grid counts from where you are", () => {
  /* R4 item 2 folded the alternatives behind a link. M59 (ISC-570) removed the
   * menu itself: Matthew, 2026-09-27, "get rid of ask about something else". */
  test("R4 item 2, superseded at M59: no menu of moves renders", async () => {
    const src = await Bun.file(
      new URL("../src/workbench/Dialogue.tsx", import.meta.url).pathname,
    ).text();
    expect(src).not.toContain('summary="Ask something else instead"');
    expect(src).not.toContain('summary="Ask about something else"');
    expect(src).not.toContain("{rest.map((move) => (");
  });

});

/**
 * The owner's two round-5 additions.
 *
 * Both are content the product did not have: the reasoning behind each of the
 * three refusals, and a statement of how the four working tabs feed each other.
 * The tests pin what each section has to carry rather than its wording, because
 * the wording is the methods critic's and will move again.
 */
describe("the refusals carry their reasoning, and the pieces say how they fit", () => {
  test("R5 item 1: every commitment card has a Why on the page, not behind a fold", async () => {
    const src = await Bun.file(
      new URL("../src/ui/Introduction.tsx", import.meta.url).pathname,
    ).text();
    // Three cards, three `why` paragraphs, rendered rather than disclosed: the
    // owner asked for the logic to be on the page.
    // M85, ISC-711: the Checks move carried a `why` of its own, so the count is
    // read inside COMMITMENTS (M88: the moves went, and the slice ends where the
    // sliders' comment opens).
    const commitments = src.slice(src.indexOf("export const COMMITMENTS"), src.indexOf("The two long lists, as sliders"));
    /* M89: two cards since "Abductive keeps contradictions visible" went with the checks. */
    expect(commitments.split("    why: ").length - 1).toBe(2);
    expect(src).toContain('<p className="commitment-why">{c.why}</p>');
    expect(src).not.toContain('summary="Why"');
  });

  test("R5 item 1: the source notes are comments, and never reach the reader", async () => {
    const src = await Bun.file(
      new URL("../src/ui/Introduction.tsx", import.meta.url).pathname,
    ).text();
    // The citations are for the owner to check the reasoning against. A reader
    // meeting "Timmermans and Tavory" on a landing page is a different product.
    expect(src).toContain("Source note (not UI copy)");
    for (const run of proseRuns(src)) {
      for (const name of ["Timmermans", "Tavory", "Golden-Biddle", "Grodal", "Schildt"]) {
        expect({ name, rendered: run.includes(name) }).toEqual({ name, rendered: false });
      }
    }
  });

  /* R5 item 2, the seven moves and the drawing beside them, left the front
   * page with "How the parts fit together" at M88 (the owner, 2026-10-14). */

  // ProseCodex batch 2: the string moved; the criterion did not.
  test("R5 item 3: the working tabs open by saying what they feed", async () => {
    /* M32, R6. Every one of these four sentences left its page body for a `?`
     * popover on that route's own header, and not one of them lost a word. The
     * JSX reflowed by a few spaces on the way, so the phrases are matched with
     * their whitespace collapsed the way a browser collapses it rather than
     * against one particular indent. What this test protects is unchanged: each
     * of the four working tabs still says what it feeds, in the tool's voice,
     * in the words the copy round settled. */
    const read = async (rel: string) =>
      (await Bun.file(new URL(`../src/${rel}`, import.meta.url).pathname).text()).replace(
        /\s+/g,
        " ",
      );
    /* M62, ISC-600: the four left their popovers for each page's Help panel,
     * where "here" and "this tab" name the page. */
    const help = await read("ui/pageHelp.ts");
    // M28 r6: copy. The reader was the object of the only verb in it.
    // M89: the clause "and every check that it runs" went with the checks.
    expect(help).toContain("Your answers on Design shape every question that Abductive asks you.");
    // M28 r6: copy. It ended on an ellipsis. More what?
    expect(help).toContain(
      "Your data grounds the concepts in your ontology. The conversation at the Early data step considers every data file here, in full.",
    );
    // M28 r6: copy. Two passives with no subject and no reader.
    // M63, ISC-614: the two pages in the owner's terms.
    expect(help).toContain("The concepts that you define for this project, with their definitions, properties and relations.");
    /* M89: Checks's two sentences (the readiness report, and when to come)
     * went with the tab. */
    expect(help).not.toContain("Abductive writes a readiness report");
  });

  /* R5 item 4, the run helper's sentence on which checks need the framing,
   * went with Checks at M89. */
});

/**
 * The station probes (R5 item 6).
 *
 * Thirty rationales that render under every question the interviewer offers,
 * and that no round audited because they live in a model-facing module. They
 * are display-only: `assembleTurnPrompt` reads `move.question` and `move.mode`
 * and never `move.rationale`, and nothing that builds a prompt reads the
 * `reason` they become on a question-selection event. The `question` strings
 * beside them are sent to the model and stay as built.
 *
 * The rules are asserted over the array rather than sentence by sentence,
 * because the wording will move again and the rules should not.
 */
describe("every station probe explains itself in the reader's own grammar", () => {
  const rationales = async (): Promise<readonly string[]> => {
    const { stationProbes } = await import("../src/interview/stationProbes.ts");
    const { STATIONS } = await import("../src/flow/stations.ts");
    const { withStationValue } = await import("../src/flow/stationBrief.ts");
    const { emptyBrief } = await import("../src/state/projects.ts");
    const out: string[] = [];
    for (const station of STATIONS) {
      /* Every branch of the picker: nothing written, something thin, and
       * answered at length, rotated so the `stated` set is reached in full.
       *
       * `withStationValue` rather than a spread keyed on the station id: the
       * brief field a station writes to is not named after the station, so a
       * spread silently produced an empty brief three times and the scan saw
       * nine sentences of the thirty. */
      const empty = emptyBrief();
      const thin = withStationValue(empty, station.id, "short");
      const full = withStationValue(empty, station.id, "x".repeat(200));
      for (const [brief, chunks] of [
        [empty, 0],
        [thin, 1],
        [full, 9],
      ] as const) {
        for (let turn = 0; turn < 6; turn += 1) {
          for (const p of stationProbes(station.id, brief, chunks, turn)) out.push(p.rationale);
        }
      }
    }
    return [...new Set(out)];
  };

  test("no probe explains itself in the tool's vocabulary", async () => {
    const found = await rationales();
    expect(found.length).toBeGreaterThan(20);
    for (const r of found) {
      for (const term of ["ontology", "residue", "puzzle root", "relation", "corpus", "adjudicat"]) {
        expect({ r, term, hit: new RegExp(term, "i").test(r) }).toEqual({ r, term, hit: false });
      }
    }
  });

  test("every probe puts the reader inside the first eight words, and stays under twenty", async () => {
    const found = await rationales();
    for (const r of found) {
      const words = r.split(/\s+/);
      expect({ r, words: words.length <= 20 }).toEqual({ r, words: true });
      // Second person, or an imperative addressed to the reader. A rationale
      // with no reader in it is a note about the tool, which is what all thirty
      // of these were.
      const head = words.slice(0, 8).join(" ");
      expect({
        r,
        addressed: /\byou(r|'ll)?\b/i.test(head) || /^(Pick|Name|Write|Record|Bring|Fix|Answer|Saturate|Either)\b/.test(head),
      }).toEqual({ r, addressed: true });
    }
  });

  test("Anti: the questions are untouched and still ask something", async () => {
    // The rationales are display-only; the questions beside them are sent to
    // the model, and rewriting one changes what the model is told to ask.
    const { stationProbes } = await import("../src/interview/stationProbes.ts");
    const { STATIONS } = await import("../src/flow/stations.ts");
    const { emptyBrief } = await import("../src/state/projects.ts");
    for (const station of STATIONS) {
      for (const p of stationProbes(station.id, emptyBrief(), 0, 0)) {
        expect({ station: station.id, asks: p.question.trim().endsWith("?") }).toEqual({
          station: station.id,
          asks: true,
        });
      }
    }
  });
});

/**
 * Where a draft came from, said in the reader's words (M29).
 *
 * The tray knew about two sources and there are three. The paper reader drafts
 * an expectation out of a paper the researcher named, and every one of those
 * was filed under "drafted from your material", which is the sentence for the
 * researcher's own transcripts and fieldnotes. On the tab whose whole promise
 * is that you can always see who put a claim there, the one draft that came out
 * of somebody else's argument was labelled as coming out of the reader's data.
 */
describe("the drafts tray names which of the three sources a draft came from", () => {
  const chunk = (id: string, documentId: string) => ({
    id,
    projectId: "p",
    documentId,
    kind: "literature" as const,
    text: "…",
    index: 0,
  });
  const doc = (id: string, name: string) => ({
    id,
    projectId: "p",
    name,
    kind: "literature" as const,
    createdAt: 0,
    chunkCount: 1,
  });

  test("a draft from a paper names the paper when the citation resolves", async () => {
    const { draftSource } = await import("../src/workbench/ProposalsTrayView.tsx");
    expect(
      draftSource(
        { originOnAccept: "literature-derived", sourceChunks: ["c1"] },
        [doc("d1", "Thorp 2023")],
        [chunk("c1", "d1")],
      ),
    ).toBe("suggested from Thorp 2023");
  });

  test("and falls back to the plural when it does not", async () => {
    const { draftSource } = await import("../src/workbench/ProposalsTrayView.tsx");
    // A bundle imported without its corpus: the proposal is on the record and
    // the passage it cites is not in this browser.
    expect(
      draftSource({ originOnAccept: "literature-derived", sourceChunks: ["gone"] }, [], []),
    ).toBe("suggested from your papers");
    expect(draftSource({ originOnAccept: "literature-derived", sourceChunks: [] }, [], [])).toBe(
      "suggested from your papers",
    );
  });

  test("the other two sources keep the words they had", async () => {
    const { draftSource } = await import("../src/workbench/ProposalsTrayView.tsx");
    expect(draftSource({ sourceTurn: "t1", sourceChunks: [] }, [], [])).toBe(
      "suggested from your answer",
    );
    expect(draftSource({ sourceChunks: ["c1"] }, [doc("d1", "ward.txt")], [chunk("c1", "d1")])).toBe(
      "suggested from your data",
    );
  });

  test("Anti: a paper draft is never filed as the researcher's own material", async () => {
    const { draftSource } = await import("../src/workbench/ProposalsTrayView.tsx");
    // The defect this exists to stop. `originOnAccept` is written only by
    // src/proposals/theory.ts, so it is the one signal that says the claim came
    // out of somebody else's argument.
    for (const sourceChunks of [[], ["c1"], ["unknown"]]) {
      const said = draftSource(
        { originOnAccept: "literature-derived", sourceChunks },
        [doc("d1", "Thorp 2023")],
        [chunk("c1", "d1")],
      );
      expect({ sourceChunks, said, own: said.includes("your data") }).toEqual({
        sourceChunks,
        said,
        own: false,
      });
    }
  });

  test("M29: the expectation type reads as a paper's expectation, not the reader's account", async () => {
    const { pageTypeGloss, pageTypeLabel, pageTypePhrase } = await import(
      "../src/ui/pageTypeVocabulary.ts"
    );
    expect(pageTypeGloss("theory")).toBe("what a paper expects here");
    expect(pageTypeLabel("theory")).toBe("expectation");
    // The article follows the label, which is what the vocabulary's `article`
    // register is for: "a theory" would have become "a expectation".
    expect(pageTypePhrase("theory", "a")).toBe("an expectation claim");
    expect(pageTypeGloss("theory")).not.toContain("you are offering");
  });
});

/* M89: "a grouped finding says what a single one says" pinned the grouped flag
 * row on Checks, which went with the checks. */


/**
 * Part 5 of the copy standard: controls and labels (M61, ISC-584).
 *
 * The rules, their sources and the owner's six decisions are in
 * `docs/copy-standard.md`; the extractor and the checks are in
 * `copyBarScan.ts`. The scan landed before the strings changed and held them
 * with a pending list that only shrank; the milestone's last commit emptied it
 * and removed it, so every check below asserts no offenders at all.
 */
describe("Part 5: every control, fold, chip and place reads as a label (M61)", () => {
  test("no control, fold or chip breaks a label rule (L1, L4, L8, L12)", async () => {
    const { labelOffenders } = await import("./copyBarScan.ts");
    const { PART5_PLACES } = await import("./copyBarPart5Places.ts");
    expect(labelOffenders(PART5_PLACES)).toEqual([]);
  });

  test("every tab and rail place is a noun of one or two words (L2)", async () => {
    const { placeNameFault } = await import("./copyBarScan.ts");
    const { TAB_AND_RAIL } = await import("./copyBarPart5Places.ts");
    const faults = TAB_AND_RAIL.flatMap((n) => {
      const f = placeNameFault(n);
      return f === null ? [] : [`place "${n}" ${f}`];
    });
    expect(faults).toEqual([]);
  });

  test("no retired word reaches a rendered string (L12)", async () => {
    const { retiredTermOffenders } = await import("./copyBarScan.ts");
    expect(retiredTermOffenders()).toEqual([]);
  });

  test("Anti: the extractor reads a label past an arrow in an attribute, and each branch of a ternary", async () => {
    const { controlLabels } = await import("./copyBarScan.ts");
    const src = [
      '<button type="button" onClick={() => n > 0 && go()}>Put it in</button>',
      '<button onClick={save}>{busy ? "Saving…" : "Save answer"}</button>',
      '<a href={h}>Remove<span className="visually-hidden"> {title}</span></a>',
      '<button onClick={f}>{row.name}{row.side === "human" ? "yours" : "the model\'s"}</button>',
      '<a href={h}>{project.title}</a>',
    ].join("\n");
    expect(controlLabels(src)).toEqual([
      { kind: "button", label: "Put it in" },
      { kind: "button", label: "Saving…" },
      { kind: "button", label: "Save answer" },
      { kind: "link", label: "Remove" },
    ]);
  });

  test("Anti: each label rule catches its shape and passes the conventional one", async () => {
    const { actionLabelFault, placeNameFault, foldSummaryFault } = await import("./copyBarScan.ts");
    const places = ["Starting point", "Early data", "Design"];
    // L1: verb first, one to three words, sentence case, no period.
    expect(actionLabelFault("Save answer")).toBeNull();
    expect(actionLabelFault("Go to Starting point", places)).toBeNull();
    expect(actionLabelFault("Save this answer for later")).not.toBeNull();
    expect(actionLabelFault("Save Answer")).not.toBeNull();
    expect(actionLabelFault("Show the claims as a list.")).not.toBeNull();
    // L5: a retired verb is not an imperative this bar accepts.
    expect(actionLabelFault("Put it in")).not.toBeNull();
    expect(actionLabelFault("Turn it down")).not.toBeNull();
    // L4: a destructive control names its object.
    expect(actionLabelFault("Remove")).not.toBeNull();
    expect(actionLabelFault("Remove document")).toBeNull();
    // The opener rule, and the replies that are not imperatives and are right.
    expect(actionLabelFault("The record")).not.toBeNull();
    expect(actionLabelFault("I don't know")).toBeNull();
    expect(actionLabelFault("Saving…")).toBeNull();
    // L2: a place is a noun of one or two words.
    expect(placeNameFault("Sources")).toBeNull();
    expect(placeNameFault("Starting point")).toBeNull();
    expect(placeNameFault("The record")).not.toBeNull();
    // The one possessive L2 admits, by the lead's ruling, and only that one.
    // M83, ISC-700: the word left, and the admission with it.
    expect(placeNameFault("Your model")).not.toBeNull();
    expect(placeNameFault("Your data")).not.toBeNull();
    expect(placeNameFault("Open checks")).not.toBeNull();
    // L12: an explanation fold reads exactly Learn more.
    expect(foldSummaryFault("Learn more")).toBeNull();
    expect(foldSummaryFault("Learn more about notes")).not.toBeNull();
    expect(foldSummaryFault("What happens when I decide?")).not.toBeNull();
    expect(foldSummaryFault("How to read this grid")).not.toBeNull();
    expect(foldSummaryFault("Model over time")).toBeNull();
  });

  test("Anti: an exported sentence that says 'from' is still read (M61 follow-up)", async () => {
    /* The import stripper matched any `export` line holding the word "from", so
     * `export const LEAD = "The tool read this puzzle from your saved answers."`
     * vanished whole and reached the Puzzle step unscanned. Only a real module
     * specifier makes a line an import. */
    const { proseRuns } = await import("./copyBarScan.ts");
    expect(proseRuns('export const LEAD = "The tool read this puzzle from your saved answers.";')).toContain(
      "The tool read this puzzle from your saved answers.",
    );
    expect(proseRuns('import { x } from "../flow/stations.ts";')).toEqual([]);
    expect(proseRuns("export { serialise, type SaveLoop } from './serialise.ts';")).toEqual([]);
  });

  test("Anti: the retired words are read beside an expression and in one-word labels (M61 walk)", async () => {
    const { jsxAdjacentRuns, shortLabelRuns } = await import("./copyBarScan.ts");
    expect(jsxAdjacentRuns("<p>The tool drafted {share}. You accepted each one.</p>")).toContain("The tool drafted");
    expect(jsxAdjacentRuns("export function draftSource(proposal: Pick<P, 'x'>) {")).toEqual([]);
    expect(shortLabelRuns("<h1>Studies</h1>")).toEqual(["Studies"]);
    expect(shortLabelRuns('<Field label="Add papers" />')).toEqual(["Add papers"]);
  });

  test("Anti: the retired words fire in prose and not in class names, and memo keeps its QDA meaning", async () => {
    const { RETIRED_TERMS } = await import("./copyBarScan.ts");
    const hit = (run: string) =>
      RETIRED_TERMS.filter(({ pattern, unless }) => pattern.test(run) && !unless?.test(run)).map((t) => t.term);
    expect(hit("Name your study to start.")).toEqual(["study"]);
    expect(hit("The tool drafts a claim.")).toEqual(["draft", "the tool"]);
    expect(hit("btn-bare study-remove")).toEqual([]);
    expect(hit("Get a memo to send someone.")).toEqual(["memo"]);
    expect(hit("Add transcripts, field notes or memos you have collected.")).toEqual([]);
    expect(hit("Open the Material tab.")).toEqual(["Material"]);
    expect(hit("Open History to see who wrote each claim.")).toEqual([]);
  });
});

/*
 * M64 (the owner, 2026-09-30), L18 and L19 in `docs/copy-standard.md`. The
 * scans are in `copyBarScan.ts`; they read every rendered run in scope plus the
 * README, the exports, the bias grid's flag labels and the interview's
 * instructions to the model.
 */
describe("M64: every clause states its subject, and no negative pronouns (L18, L19)", () => {
  test("no rendered clause puts its subject after its object (L18, ISC-617)", async () => {
    const { reducedRelativeOffenders } = await import("./copyBarScan.ts");
    expect(reducedRelativeOffenders()).toEqual([]);
  });

  test("no rendered sentence says nothing, nobody, no one or nowhere (L19, ISC-618)", async () => {
    const { negativePronounOffenders } = await import("./copyBarScan.ts");
    expect(negativePronounOffenders()).toEqual([]);
  });

  test("Anti: the owner's example and its kin are caught, and the rewrites pass (L18)", async () => {
    const { reducedRelatives } = await import("./copyBarScan.ts");
    for (const s of [
      "Emerging project ontology opens at the first concept Abductive suggests.",
      "a concept you accepted",
      "Add the papers you expect to draw on.",
      "Match a file you sent last week back to the project it came from.",
      "Questions Abductive asked you, including the ones you passed on.",
      "Everything you cite here comes from your list.",
      "Which of the expectations you took from these papers will break?",
      "Every choice in the design is the one a reviewer would have guessed.",
      "Abductive asks the questions a careful colleague would ask.",
      "Another program is using port 8787, the port the bridge needs.",
      "The summary this answer came from is no longer in History.",
    ]) {
      expect({ s, hit: reducedRelatives(s).length > 0 }).toEqual({ s, hit: true });
    }
    for (const s of [
      "Emerging project ontology opens when Abductive suggests a first concept.",
      "a concept that you accepted",
      "Add the papers that you expect to draw on.",
      "Abductive tells you what to do next.",
      "Pick cases that differ on everything and you can't read the contrast.",
      "History shows which model it ran.",
      "Your named venue's reviewers expect a clear contribution.",
      "Records that you set it aside for now.",
      "The page lets you see each flag.",
      "Claims that cited those passages keep the citation in History.",
      "Abductive asks the questions that a careful colleague would ask.",
      "The key beside the table gives the meaning of each column.",
    ]) {
      expect({ s, hit: reducedRelatives(s) }).toEqual({ s, hit: [] });
    }
  });

  test("Anti: the negative pronouns are caught as whole words, and the determiner passes (L19)", async () => {
    const { NEGATIVE_PRONOUN } = await import("./copyBarScan.ts");
    for (const s of ["Nothing joins your ontology.", "If nobody can settle the outcome.", "No one answered.", "It goes nowhere else."])
      expect({ s, hit: NEGATIVE_PRONOUN.test(s) }).toEqual({ s, hit: true });
    for (const s of ["No open flags", "No projects yet.", "No one-word sentences.", "kind: nothing-said", "the none-case"])
      expect({ s, hit: NEGATIVE_PRONOUN.test(s) }).toEqual({ s, hit: false });
  });

  test("every allow-list entry carries its reason", async () => {
    const { CLAUSE_ALLOW, NEGATIVE_ALLOW } = await import("./copyBarScan.ts");
    for (const a of [...CLAUSE_ALLOW, ...NEGATIVE_ALLOW]) expect(a.why.length).toBeGreaterThan(20);
  });

  test("the rules are L18 and L19 in the copy standard", async () => {
    const standard = await Bun.file(new URL("../docs/copy-standard.md", import.meta.url).pathname).text();
    expect(standard.includes("**L18.")).toBe(true);
    expect(standard.includes("**L19.")).toBe(true);
  });
});

/**
 * M65 (the owner, 2026-09-30), L20 in `docs/copy-standard.md`: "Don't use the
 * term never." Rendered copy says what does happen, and a prompt states a rule
 * to the model as "Do not …". The scan reads the M64 population and every other
 * source file under `src`, which is where the prompts sent to the model live.
 */
describe("M65: never is out of the copy and the prompts (L20)", () => {
  test("no rendered sentence or prompt says never", async () => {
    const { neverOffenders } = await import("./copyBarScan.ts");
    expect(neverOffenders()).toEqual([]);
  });

  /* L22 (the owner, 2026-10-30): "don't use the word 'card' to refer to stuff in the tool." */
  test("no rendered string or prompt calls anything in Abductive a card (L22)", async () => {
    const { cardOffenders } = await import("./copyBarScan.ts");
    expect(cardOffenders()).toEqual([]);
  });

  /* L23 and L24 (the owner, 2026-10-30, M96): "The tool should not use the verb
     'read' or 'reads'", and "It should be called a walkthrough". */
  test("no rendered string, export or prompt uses the verb read (L23)", async () => {
    const { readOffenders } = await import("./copyBarScan.ts");
    expect(readOffenders()).toEqual([]);
  });

  test("no rendered string, export or prompt calls anything a walk (L24)", async () => {
    const { walkOffenders } = await import("./copyBarScan.ts");
    expect(walkOffenders()).toEqual([]);
  });

  test("Anti: L23 and L24 catch the verb and the noun, and pass the longer words", async () => {
    const { READ_WORD, WALK_NOUN } = await import("./copyBarScan.ts");
    for (const s of ["Read the data", "Abductive reads your data.", "Reading files…", "still unread", "reread it", "Read more"])
      expect({ s, hit: READ_WORD.test(s) }).toEqual({ s, hit: true });
    for (const s of ["Ready to collect data", "the reader", "a thread", "already", "read-only", "Machine-readable"])
      expect({ s, hit: READ_WORD.test(s) }).toEqual({ s, hit: false });
    for (const s of ["the walk of record", "two walks", "A walk showed it"])
      expect({ s, hit: WALK_NOUN.test(s) }).toEqual({ s, hit: true });
    for (const s of ["the walkthrough", "Walk me through the day.", "walk you through it", "a sidewalk"])
      expect({ s, hit: WALK_NOUN.test(s) }).toEqual({ s, hit: false });
  });

  test("Anti: the word is caught in any case, and a hyphenated identifier passes", async () => {
    const { NEVER_WORD } = await import("./copyBarScan.ts");
    for (const s of [
      "Abductive never sends your key anywhere.",
      "Never supply the standard theoretical label.",
      "The filters change which entries you see, and never what History keeps.",
      "so questions never stack up",
      "NEVER write in their voice.",
    ])
      expect({ s, hit: NEVER_WORD.test(s) }).toEqual({ s, hit: true });
    /* M87: the retired check id stays here, because History still shows it
     * beside a dismissal on the shipped example. */
    for (const s of ["paper-never-engaged", "Do not supply the standard theoretical label.", "Nevertheless, it stands.", "a neverending list"])
      expect({ s, hit: NEVER_WORD.test(s) }).toEqual({ s, hit: false });
  });

  test("Anti: a planted sentence in a scanned file is caught", async () => {
    const { NEVER_WORD, proseRuns, sentencesOf } = await import("./copyBarScan.ts");
    const planted = 'export const HELP = "Your key stays on this machine. Abductive never sends it anywhere.";';
    const hits = proseRuns(planted).flatMap((r) => sentencesOf(r)).filter((s) => NEVER_WORD.test(s));
    expect(hits).toEqual(["Abductive never sends it anywhere."]);
  });

  test("every allow-list entry carries its reason", async () => {
    const { NEVER_ALLOW } = await import("./copyBarScan.ts");
    for (const a of NEVER_ALLOW) expect(a.why.length).toBeGreaterThan(20);
  });

  test("the rule is L20 in the copy standard", async () => {
    const standard = await Bun.file(new URL("../docs/copy-standard.md", import.meta.url).pathname).text();
    expect(standard.includes("**L20.")).toBe(true);
  });
});

/**
 * M65 addendum (the owner, 2026-09-30), L18's passive case: "This and other
 * sentences do not have a clear subject for the clause." A passive whose actor
 * is missing names its agent or turns active; a state stays only as an adjective.
 */
describe("M65: an act names its agent, and no passive leaves its actor out (L18, ISC-624, ISC-625)", () => {
  test("no rendered sentence or prompt holds an agentless passive", async () => {
    const { agentlessPassiveOffenders } = await import("./copyBarScan.ts");
    expect(agentlessPassiveOffenders()).toEqual([]);
  });

  test("Anti: the owner's sentence and its kin are caught", async () => {
    const { agentlessPassives } = await import("./copyBarScan.ts");
    for (const s of [
      "The steps were set aside.",
      "Sample opens once the six steps in the loops have an answer or were set aside.",
      "The reveal is logged to the ledger.",
      "Residual observations get assimilated into the working categories.",
      "Challenges have been left unadjudicated.",
      "Answer 'unclear' when you cannot tell from what you have been given.",
      "Your setting or your site isn't described yet.",
    ])
      expect({ s, hit: agentlessPassives(s).length > 0 }).toEqual({ s, hit: true });
  });

  test("Anti: an active clause, a named agent and an adjectival state pass", async () => {
    const { agentlessPassives } = await import("./copyBarScan.ts");
    for (const s of [
      "Sample opens once you have answered or set aside all six steps in the loops.",
      "This expectation is held in the setting by the founders.",
      "The flag is open.",
      "The field is empty.",
      "The world that your project is set in.",
      "Your project is unchanged.",
      "Most of the data is still unopened.",
      "Getting started",
      "Abductive keeps the key for this session only.",
    ])
      expect({ s, hit: agentlessPassives(s) }).toEqual({ s, hit: [] });
  });

  test("a planted sentence in a scanned file is caught", async () => {
    const { agentlessPassives, proseRuns, sentencesOf } = await import("./copyBarScan.ts");
    const planted = 'export const HINT = "Sample opens soon. The steps were set aside.";';
    const hits = proseRuns(planted).flatMap((r) => sentencesOf(r)).filter((s) => agentlessPassives(s).length > 0);
    expect(hits).toEqual(["The steps were set aside."]);
  });

  test("every allow-list entry carries its reason", async () => {
    const { STATE_ALLOW } = await import("./copyBarScan.ts");
    for (const a of STATE_ALLOW) expect(a.why.length).toBeGreaterThan(20);
  });

  /* ISC-626's "answered or set aside" is superseded by ISC-641 (M69): the
   * set-aside went, and the hint names who answers and which steps still need it. */
  test("the loop gate's hint names who answers (ISC-626, ISC-641)", async () => {
    const { gateSentence } = await import("../src/flow/loopGate.ts");
    expect(gateSentence("sample")).toBe("Sample opens once you have answered all six steps in the loops.");
  });

  test("L18 in the copy standard covers the passive case", async () => {
    const standard = await Bun.file(new URL("../docs/copy-standard.md", import.meta.url).pathname).text();
    expect(standard.includes("agentless passive")).toBe(true);
  });
});
