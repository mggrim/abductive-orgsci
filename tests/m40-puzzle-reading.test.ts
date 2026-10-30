/**
 * The puzzle as the tool's reading (M40, ISC-508, ISC-509).
 *
 * The puzzle stopped being a field. It was the second box in the framing band,
 * asking what you expected to find and what you found instead, and a co-author's
 * point at M37 was that the question presumes three things a researcher on day
 * one does not hold: an expectation, a finding, and the conflict between them.
 * M37 answered by letting the box come back empty. The owner's answer on
 * 2026-09-12 is not to ask: "I'm not sure the puzzle part of this should be
 * editable. It should be surfaced as a summary from early data and other parts."
 *
 * Five claims, and the order below is the order the machinery runs in.
 *
 *   the projection  what there is to read, what it hashes to, and which of six
 *                   states the puzzle is in. Pure, so every sentence the band
 *                   will say can be asserted with no model and no DOM.
 *   the prompt      the blocks are all listed and labelled, both marked lines are
 *                   offered, and the reading is never handed its own output.
 *   the parser      a puzzle, a reason, and the gap-only case the first live walk
 *                   of M37 found the hard way.
 *   the band        the reading on screen, where it was read from, whether it has
 *                   moved since, and whose words it is.
 *   the writer      one event per reading, the field mirrored, no `bound` row, and
 *                   a second mount over the same material paying for nothing.
 *
 * The writer and the band are rendered against a real IndexedDB, a real ledger
 * provider and a counting client, because "it makes one call and not two" and "it
 * writes no `bound` row" are both claims about what happens and neither can be
 * made from the projection.
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterAll, beforeEach, describe, expect, test, mock } from "bun:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { Chunk, StoredDocument } from "../src/state/chunks.ts";
import type { LedgerEvent, PuzzleReadingEvent, PuzzleSource } from "../src/ledger/events.ts";
/* Types only, so nothing is imported at runtime and the module mocks above still
 * stand: a static value import here would be hoisted above them. The dynamic
 * imports these annotate come back as `any`, and an `any` in a test is a test that
 * cannot fail on a shape change. */
import type { PuzzleSourcesView, PuzzleState } from "../src/views/puzzleReading.ts";

const SRC = new URL("../src/", import.meta.url).pathname;

/**
 * The inference client, swapped for one that counts and answers to order.
 *
 * `activeInferenceClient` reports the mock as not live on purpose, so the offline
 * banner can stop a researcher reading fixtures as findings; these tests need it
 * live. The real namespace is spread in and restored in `afterAll`, because
 * `mock.module` is process-wide and every test file shares the process: a
 * replacement holding one export makes the others vanish for the whole run. That
 * is the lesson `m37-station-chat.test.ts` records and it is not relearned here.
 */
let live = true;
let reply = "PUZZLE: I expected a decision point and found a drift.";
const requests: { system: string }[] = [];
class CountingClient {
  async complete(req: { system: string }) {
    requests.push({ system: req.system });
    await wait(1);
    return { text: reply, model: "mock", modelVersion: "mock-1" };
  }
}
const realPersonaRun = { ...(await import(`${SRC}ui/personaRun.ts`)) };
await mock.module(`${SRC}ui/personaRun.ts`, () => ({
  ...realPersonaRun,
  activeInferenceClient: () => ({ client: new CountingClient(), live }),
}));
afterAll(() => {
  void mock.module(`${SRC}ui/personaRun.ts`, () => realPersonaRun);
});

/* The paper judge is the other thing on this surface that would call a model, and
 * it is not what these tests are about. Stubbed and put back, for the reason the
 * persona run is. `judgingAvailableAsync` is kept real: the reading waits on it,
 * and a stub that always said yes would hide the one thing it is there for. */
const realPaperFit = { ...(await import(`${SRC}flow/usePaperFit.ts`)) };
await mock.module(`${SRC}flow/usePaperFit.ts`, () => ({
  ...realPaperFit,
  usePaperFit: () => async () => 0,
  useJudgeOnMount: () => undefined,
}));
afterAll(() => {
  void mock.module(`${SRC}flow/usePaperFit.ts`, () => realPaperFit);
});

const { InMemoryLedgerStore } = await import(`${SRC}ledger/ledger.ts`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);
const { MotivationPage } = await import(`${SRC}flow/FramingBand.tsx`);
const { PuzzleOffer } = await import(`${SRC}flow/PuzzleOffer.tsx`);
const { LedgerView } = await import(`${SRC}workbench/Instrumentation.tsx`);
const projects = await import(`${SRC}state/projects.ts`);
const reading = await import(`${SRC}views/puzzleReading.ts`);
const prompt = await import(`${SRC}interview/puzzlePrompt.ts`);
const { validateEvent } = await import(`${SRC}ledger/events.ts`);
const { resetPuzzleReadingLoops } = await import(`${SRC}flow/usePuzzleReading.ts`);
const { announceHere } = await import(`${SRC}state/useStudyFreshness.ts`);
const { projectLedger } = await import(`${SRC}workbench/Instrumentation.tsx`);
const { emptyBrief } = projects;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT = "m40-puzzle";

let seq = 0;
const uid = () => `eeeeeeee-4000-4000-8000-${String((seq += 1)).padStart(12, "0")}`;

/** The brief of a study that has answered the framing and three steps. */
function brief(over: Record<string, unknown> = {}) {
  return {
    ...emptyBrief(),
    startingInterest: "night handovers on one ward",
    context: "a teaching hospital that runs two night shifts",
    earlySurprise: "the sheet was blank three nights running and nobody said so",
    siteRationale: "the only ward that would have me",
    ...over,
  };
}

function doc(id: string, name: string, kind = "transcript"): StoredDocument {
  return { id, projectId: PROJECT, name, kind, createdAt: 1, chunkCount: 1 } as StoredDocument;
}

function chunk(id: string, documentId: string, index: number, text: string): Chunk {
  return { id, projectId: PROJECT, documentId, kind: "transcript", text, index } as Chunk;
}

/** Three data passages across two files, plus a paper that must never be read. */
const DOCUMENTS: readonly StoredDocument[] = [
  doc("d1", "Ward nights, transcript one"),
  doc("d2", "Fieldnotes, week two"),
  doc("d3", "Bechky 2003", "literature"),
];
const CHUNKS: readonly Chunk[] = [
  chunk("c1", "d1", 0, "She said the sheet was there but nobody had filled it."),
  chunk("c2", "d1", 1, "The handover happened in the corridor, standing up."),
  chunk("c3", "d2", 0, "Two nurses disagreed about which patient was the worry."),
  chunk("c4", "d2", 1, "A fourth passage, so the digest has to choose three."),
  { ...chunk("cp", "d3", 0, "Occupational communities share no vocabulary."), kind: "literature" },
];

function input(over: Record<string, unknown> = {}) {
  return {
    brief: brief(),
    chunks: CHUNKS,
    documents: DOCUMENTS,
    events: [] as readonly LedgerEvent[],
    projectId: PROJECT,
    ...over,
  };
}

/** A reading on the record, of whatever the sources and digest currently are. */
function read(
  text: string,
  sources: readonly PuzzleSource[],
  digest: string,
  none?: string,
): PuzzleReadingEvent {
  return {
    id: uid(),
    ts: 1_700_000_000_000 + (seq += 1),
    actor: "persona:interviewer",
    projectId: PROJECT,
    model: "mock",
    modelVersion: "mock-1",
    type: "puzzle-reading",
    text,
    ...(none === undefined ? {} : { none }),
    sources,
    digest,
  };
}

// ---------------------------------------------------------------------------
// The projection
// ---------------------------------------------------------------------------

describe("what there is to read, and what it hashes to (ISC-508)", () => {
  test("the sources are the interest, the answered steps, and three data passages", () => {
    const { sources, blocks }: PuzzleSourcesView = reading.puzzleSources(input());
    expect(sources).toEqual([
      { kind: "answer", subject: "starting-interest" },
      { kind: "answer", subject: "context" },
      { kind: "answer", subject: "site" },
      { kind: "answer", subject: "early-data" },
      { kind: "passage", chunkId: "c1" },
      { kind: "passage", chunkId: "c2" },
      { kind: "passage", chunkId: "c3" },
    ]);
    /* The blocks are labelled in the place's own words, never a slug. A model
     * writes back the vocabulary it is given, which is how "analytic-residue"
     * reached the Checks tab as model prose no source file contained. */
    expect(blocks.map((b) => b.label)).toEqual([
      "Your starting interest",
      "Context",
      "Site",
      "Early data",
      "Ward nights, transcript one, passage 1",
      "Ward nights, transcript one, passage 2",
      "Fieldnotes, week two, passage 1",
    ]);
  });

  test("an empty answer is not a source, and a paper is never a passage", () => {
    /* Both halves are about what would be wrong to cite. A block reading
     * "Early data: " tells the model the step exists and says nothing about the
     * study, and a source on the event that carries no evidence is a citation that
     * cannot be followed. And a paper is not evidence about the setting: a reading
     * held against one is the literature coming back as a finding, which is the
     * bias this whole tool exists to measure. */
    const { sources } = reading.puzzleSources(input({ brief: brief({ siteRationale: "  \n " }) }));
    expect(sources).not.toContainEqual({ kind: "answer", subject: "site" });
    for (const source of sources) {
      expect(source.kind === "passage" ? source.chunkId : "").not.toBe("cp");
    }
  });

  test("the bind step is deliberately not read", () => {
    /* It asks what pulls against what, which is already an account of a conflict.
     * Handing the tool one is how a reading starts agreeing with the researcher's
     * own framing instead of being read out of what they observed. */
    const { sources } = reading.puzzleSources(
      input({ brief: brief({ bind: "the ward wants speed and the record wants detail" }) }),
    );
    expect(sources).not.toContainEqual({ kind: "answer", subject: "bind" });
    expect(reading.PUZZLE_STATIONS).not.toContain("bind");
  });

  test("the digest is the same string twice over the same material", () => {
    // A digest that moved between two calls over one study would make the band say
    // "something it read has moved since" on every render, for ever.
    expect(reading.puzzleSources(input()).digest).toBe(reading.puzzleSources(input()).digest);
    // And whitespace is not a change: a reformatting must not cost a model call.
    expect(reading.puzzleSources(input({ brief: brief({ context: "a  teaching hospital that runs two night shifts " }) })).digest).toBe(
      reading.puzzleSources(input()).digest,
    );
  });

  test("it moves when the Early data answer moves", () => {
    const before = reading.puzzleSources(input()).digest;
    const after = reading.puzzleSources(
      input({ brief: brief({ earlySurprise: "the sheet was full and nobody had read it" }) }),
    ).digest;
    expect(after).not.toBe(before);
  });

  test("and it never moves because the puzzle itself moved (ISC-508)", () => {
    /* The load-bearing exclusion. The reading writes `brief.researchQuestion`, so a
     * digest that covered it would compare unequal to itself the instant the write
     * landed: every reading would be stale on its own output, for ever, with a
     * control beside it that made it happen again. */
    const plain = reading.puzzleSources(input()).digest;
    for (const puzzle of ["", "a reading the tool wrote", "a different reading"]) {
      expect({
        puzzle,
        digest: reading.puzzleSources(input({ brief: brief({ researchQuestion: puzzle }) })).digest,
      }).toEqual({ puzzle, digest: plain });
    }
  });
});

describe("how the puzzle stands, in one of six states (ISC-508)", () => {
  test("nothing saved yet is nothing to read", () => {
    const state = reading.puzzleState(input({ brief: emptyBrief(), chunks: [], documents: [] }));
    expect(state.kind).toBe("nothing-to-read");
  });

  test("something saved and no reading yet is unread", () => {
    const state = reading.puzzleState(input());
    expect(state.kind).toBe("unread");
    expect(state.kind === "unread" && state.sources.length).toBeGreaterThan(0);
  });

  test("a puzzle in the field that no reading wrote is stated", () => {
    /* A study framed before M40 typed one into the box that used to be there, and
     * the hosted example is one. It is theirs, so it is shown and it is not
     * relabelled as the tool's. */
    const state = reading.puzzleState(
      input({ brief: brief({ researchQuestion: "I expected a point and found a drift" }) }),
    );
    expect(state).toEqual({ kind: "stated", text: "I expected a point and found a drift" });
  });

  test("a reading that found none says which half was missing", () => {
    const { sources, digest } = reading.puzzleSources(input());
    const state = reading.puzzleState(
      input({ events: [read("", sources, digest, "Nothing saved says what you expected.")] }),
    );
    expect(state.kind).toBe("none");
    expect(state.kind === "none" && state.reason).toBe("Nothing saved says what you expected.");
    expect(state.kind === "none" && state.stale).toBe(false);
  });

  test("a reading that found one carries its text and where it was read from", () => {
    const { sources, digest } = reading.puzzleSources(input());
    const state = reading.puzzleState(
      input({ events: [read("Expected a decision point, found a drift.", sources, digest)] }),
    );
    expect(state.kind).toBe("read");
    if (state.kind !== "read") throw new Error("expected a read state");
    expect(state.text).toBe("Expected a decision point, found a drift.");
    expect(state.stale).toBe(false);
    /* The answers keep their labels and the passages collapse to a count, because
     * those are the two things a reader can act on: an answer is somewhere they can
     * go and revise, and their own material is not something they revise. */
    expect(state.readFrom).toEqual([
      "Your starting interest",
      "Context",
      "Site",
      "Early data",
      "3 passages",
    ]);
    expect(reading.readFromSentence(state.readFrom)).toBe(
      "Your starting interest, Context, Site, Early data and 3 passages",
    );
  });

  test("and it is stale once what it read has moved", () => {
    const { sources, digest } = reading.puzzleSources(input());
    const moved = brief({ earlySurprise: "the sheet was full and nobody had read it" });
    const state = reading.puzzleState(
      input({
        brief: moved,
        events: [read("Expected a decision point, found a drift.", sources, digest)],
      }),
    );
    expect(state.kind === "read" && state.stale).toBe(true);
  });

  test("the latest reading is the one that counts, in append order", () => {
    const { sources, digest } = reading.puzzleSources(input());
    const events = [
      read("The first reading.", sources, digest),
      read("The second reading.", sources, digest),
    ];
    expect(reading.latestReading(events, PROJECT)?.text).toBe("The second reading.");
    // And another study's reading is not this study's.
    const theirs = { ...events[0], projectId: "someone-else" } as PuzzleReadingEvent;
    expect(reading.latestReading([theirs], PROJECT)).toBeNull();
  });

  test("the six lines the band says are one per state, and none of them is blank", () => {
    /* Every sentence a reader meets about the puzzle is written beside the
     * projection rather than in the markup, for the reason `views/findings.ts`
     * holds its own line: one sentence, one place, and the surface that draws it
     * cannot reword it. */
    const { sources, digest } = reading.puzzleSources(input());
    const states: PuzzleState[] = [
      reading.puzzleState(input({ brief: emptyBrief(), chunks: [], documents: [] })),
      reading.puzzleState(input()),
      reading.puzzleState(input({ brief: brief({ researchQuestion: "typed once" }) })),
      reading.puzzleState(input({ events: [read("", sources, digest, "No expectation stated.")] })),
      reading.puzzleState(input({ events: [read("A puzzle.", sources, digest)] })),
    ];
    const lines = states.map((s: PuzzleState) =>
      band.puzzleSourceLine(s, { reading: false, error: null }),
    );
    for (const line of lines) {
      expect(line.trim()).not.toBe("");
      // C7: no dashes anywhere a researcher reads.
      expect(line).not.toMatch(/[‒–—―]/);
    }
    // Each state says something different, which is the point of having six.
    expect(new Set(lines).size).toBe(lines.length);
    // And the two states with something in flight or something wrong say so.
    expect(band.puzzleSourceLine(states[1] as PuzzleState, { reading: true, error: null })).toBe(
      band.READING_NOW,
    );
    expect(
      band.puzzleSourceLine(states[4] as PuzzleState, { reading: false, error: "no bridge" }),
    ).toContain("no bridge");
  });
});

// ---------------------------------------------------------------------------
// The prompt and the parser
// ---------------------------------------------------------------------------

describe("the prompt that reads the puzzle (ISC-508)", () => {
  test("every block is listed, under its own label", () => {
    const { blocks }: PuzzleSourcesView = reading.puzzleSources(input());
    const system = prompt.puzzlePrompt(blocks);
    for (const block of blocks) {
      expect({ label: block.label, listed: system.includes(`### ${block.label}`) }).toEqual({
        label: block.label,
        listed: true,
      });
      expect(system).toContain(block.text);
    }
  });

  test("both marked lines are offered, and neither half may be filled", () => {
    const system = prompt.puzzlePrompt(reading.puzzleSources(input()).blocks);
    expect(system).toContain(prompt.PUZZLE_LINE);
    expect(system).toContain(prompt.NONE_LINE);
    expect(system).toContain("Do not fill either half.");
    // The two weightings the reading turns on.
    expect(system).toContain("Early data outranks the other answers");
    expect(system).toContain("The starting interest is the weakest evidence of an expectation.");
    // And it says what it is being asked for, so the mock can branch on it.
    expect(system).toContain("## Puzzle rules");
  });

  test("a quoted phrase is not also paraphrased in the same sentence (D52, M43d)", () => {
    /* The walk of 2026-09-13 read the fifth reading of its study and found the
     * board's aim stated twice in one sentence: a paraphrase, a comma, then the
     * quoted original of the same clause. The prompt asked for quotes and never
     * said a quote replaces the paraphrase rather than following it. */
    const system = prompt.puzzlePrompt(reading.puzzleSources(input()).blocks);
    expect(system).toContain("Quote a phrase or paraphrase it. Do not do both.");
    expect(system).toContain("do not also say the same thing in your own words");
    // The instruction that invited it is still there, because quoting is right.
    expect(system).toContain("Quote their words where you can.");
  });

  test("Anti: the reading is never handed its own previous output", async () => {
    /* The one generator in this codebase that must not receive `studyContext()`.
     * The block carries `puzzle`, which is `brief.researchQuestion`, which is where
     * this reading is stored: shown its own output as evidence it would converge on
     * it, and the record would hold three independent readings agreeing. */
    /* Comments are stripped first. The file's own header names the block in order
     * to say why it is absent, which is where that reasoning belongs; a scan that
     * read comments would force the record out of the source, which is the call
     * `tests/copy-bar.test.ts` makes in its own `Anti` case. */
    const source = (await Bun.file(`${SRC}interview/puzzlePrompt.ts`).text())
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ");
    expect(source).not.toContain("studyContext");
    expect(source).not.toContain("renderStudyContext");
    // And the field itself never reaches the prompt by any other route.
    const system = prompt.puzzlePrompt(
      reading.puzzleSources(input({ brief: brief({ researchQuestion: "the last reading" }) })).blocks,
    );
    expect(system).not.toContain("the last reading");
  });
});

describe("reading the marked line back (ISC-508)", () => {
  test("a puzzle comes back as a puzzle", () => {
    expect(
      prompt.parsePuzzleReading("PUZZLE: They expected a decision point and found a drift."),
    ).toEqual({ puzzle: "They expected a decision point and found a drift." });
  });

  test("two sentences over two lines are one puzzle", () => {
    const parsed = prompt.parsePuzzleReading(
      ["PUZZLE: They expected a decision point.", "They found a drift instead."].join("\n"),
    );
    expect(parsed).toEqual({
      puzzle: "They expected a decision point. They found a drift instead.",
    });
  });

  test("a reason comes back as a reason", () => {
    expect(prompt.parsePuzzleReading("NONE: Nothing saved says what they expected.")).toEqual({
      none: "Nothing saved says what they expected.",
    });
  });

  test("a puzzle that is only gap markers has said nothing", () => {
    /* The first live walk of M37, one control over. Asked for something nobody had
     * stated, the model did exactly as it was told and returned the marker alone,
     * and the literal string "[...]" landed in the researcher's own field because a
     * part that is only gaps is not empty by string comparison. */
    for (const gap of ["[…]", "[...]", "[ ... ]", "[…]."]) {
      // M42: the sentence itself moved to the projection that prints it, beside
      // NO_REASON_GIVEN. The parser's answer is unchanged.
      expect(prompt.parsePuzzleReading(`PUZZLE: ${gap}`)).toEqual({
        none: reading.GAP_ONLY_REASON,
      });
    }
  });

  test("an unmarked reply is a reason and never an invented puzzle", () => {
    /* A model that ignored the contract has given the tool no reading it can
     * attribute, and pulling one out of its prose would be the tool filling the
     * half the whole prompt refuses to fill. */
    expect(prompt.parsePuzzleReading("I think the puzzle here is about drift.")).toEqual({
      none: reading.GAP_ONLY_REASON,
    });
    expect(prompt.parsePuzzleReading("")).toEqual({ none: reading.GAP_ONLY_REASON });
  });

  test("a reply carrying both lines is read as the puzzle", () => {
    // A model that answered and then hedged has answered; the answer is the part
    // that says something.
    expect(
      prompt.parsePuzzleReading(
        ["PUZZLE: They expected a point and found a drift.", "NONE: or maybe not."].join("\n"),
      ),
    ).toEqual({ puzzle: "They expected a point and found a drift." });
  });
});

// ---------------------------------------------------------------------------
// The event
// ---------------------------------------------------------------------------

describe("a reading is its own event on the record (ISC-509)", () => {
  test("it validates, and a reading of nothing is refused", () => {
    const { sources, digest } = reading.puzzleSources(input());
    const event = read("They expected a point and found a drift.", sources, digest);
    expect(validateEvent(event)).toEqual([]);
    // The sources are what make "the tool's reading of what you saved" checkable,
    // the same way `brief-draft.fromTurnIds` is. A reading of nothing is not one.
    expect(validateEvent({ ...event, sources: [] })).not.toEqual([]);
    // Neither a puzzle nor a reason is a row a reader cannot act on or argue with.
    expect(validateEvent({ ...event, text: "" })).not.toEqual([]);
    // Empty with a reason is the state this event was built to record.
    expect(validateEvent({ ...event, text: "", none: "No expectation stated." })).toEqual([]);
    // And a source naming neither a subject nor a passage cannot be followed.
    expect(validateEvent({ ...event, sources: [{ kind: "answer" }] })).not.toEqual([]);
    expect(validateEvent({ ...event, sources: [{ kind: "guess", subject: "x" }] })).not.toEqual([]);
  });

  test("the record reads it as the tool's act, in both columns (ISC-509)", () => {
    /* "Read the puzzle" with no subject would read as something the researcher did,
     * on a row whose actor column says a persona. The record's rule since M28 is
     * that a row names the thing the reader did or the thing the tool has, and this
     * is the second kind. */
    const { sources, digest } = reading.puzzleSources(input());
    const found = projectLedger([read("Expected a point, found a drift.", sources, digest)])[0];
    expect(found?.happened).toBe(
      "Abductive suggested the puzzle from Your starting interest, Context, Site, Early data and 3 passages",
    );
    expect(found?.changed).toBe("the suggested puzzle");
    expect(found?.kind).toBe("puzzle-reading");
    const none = projectLedger([read("", sources, digest, "No expectation stated.")])[0];
    expect(none?.happened).toBe("Abductive considered the answers that you have saved and found the puzzle still to come");
    // Never "your puzzle" and never "as you stated it", on any row.
    for (const row of [found, none]) {
      expect(`${row?.happened} ${row?.changed}`.toLowerCase()).not.toContain("your puzzle");
      expect(`${row?.happened} ${row?.changed}`.toLowerCase()).not.toContain("you stated");
    }
  });

  test("and the record renders the row, with the tool named on it", () => {
    /* `LedgerView` rather than the whole panel, because the timeline is the part of
     * the record this row is in and the three readings under it are not what the
     * claim is about. It is the same component both frames mount: the dialog from
     * the study header and the Design companion render one `RecordBody`, which
     * renders one `Instrumentation`, which renders this. */
    const { sources, digest } = reading.puzzleSources(input());
    const events = [read("Expected a point, found a drift.", sources, digest)];
    const html = renderToStaticMarkup(
      React.createElement(LedgerView as never, { events }),
    );
    expect(html).toContain("Abductive suggested the puzzle from");
    expect(html).toContain("the suggested puzzle");
    // The kind marker and the filter label both say it is the tool's.
    expect(html).toContain("PZL");
    expect(html).toContain("puzzle that Abductive suggested");
  });
});

// ---------------------------------------------------------------------------
// The band, rendered
// ---------------------------------------------------------------------------

const band = await import(`${SRC}flow/FramingBand.tsx`);

async function mount(node: React.ReactElement, store: InstanceType<typeof InMemoryLedgerStore>) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(LedgerProvider, { store }, node));
  });
  for (let i = 0; i < 14; i += 1) {
    await act(async () => {
      await wait(5);
    });
  }
  return { host, root };
}

async function study(id: string, over: Record<string, unknown> = {}) {
  await projects.saveProject({
    id,
    title: "night wards",
    stage: "design-brief",
    createdAt: 1,
    brief: { ...brief(), ...over },
  } as never);
  for (const d of DOCUMENTS) await projects.saveDocument({ ...d, projectId: id });
  await projects.saveChunks(CHUNKS.map((c) => ({ ...c, projectId: id })));
  return (await projects.getProject(id)) as NonNullable<Awaited<ReturnType<typeof projects.getProject>>>;
}

async function storeWith(events: readonly LedgerEvent[]) {
  const store = new InMemoryLedgerStore();
  for (const event of events) await store.append(event);
  return store;
}

function find(host: Element, id: string): Element | null {
  return host.querySelector(`[data-testid="${id}"]`);
}

/**
 * The Puzzle step's offer, drawn from storage as the step draws it (ISC-587).
 *
 * The M61 follow-up took the reading off Starting point (owner, 2026-09-30:
 * "it's already part of the design"), so the sentences these tests read off the
 * page's block are read off the step's offer instead. Starting point still asks
 * for a reading when one is due, which is what the writer tests below drive.
 */
async function offerFor(id: string, store: InstanceType<typeof InMemoryLedgerStore>) {
  const stored = (await projects.getProject(id)) as { brief: never };
  return mount(
    React.createElement(PuzzleOffer, {
      projectId: id,
      brief: stored.brief,
      events: await store.readAll(),
      chunks: await projects.listChunks(id),
      documents: await projects.listDocuments(id),
      onChanged: () => undefined,
    }),
    store,
  );
}
function press(el: Element | null) {
  const key = Object.keys(el ?? {}).find((k) => k.startsWith("__reactProps$"));
  const props =
    key === undefined
      ? undefined
      : (el as unknown as Record<string, Record<string, (e: unknown) => void>>)[key];
  props?.onClick?.({ preventDefault() {} });
}

describe("the Puzzle step shows the reading and Starting point shows none of it (ISC-508, ISC-587)", () => {
  beforeEach(() => {
    resetPuzzleReadingLoops();
    requests.length = 0;
    live = false;
    reply = "PUZZLE: I expected a decision point and found a drift.";
  });

  test("the reading, where it was read from, and the sentence saying it is the tool's", async () => {
    const id = "m40-band-read";
    const project = await study(id);
    const { sources, digest } = reading.puzzleSources({
      brief: project.brief,
      chunks: CHUNKS.map((c) => ({ ...c, projectId: id })),
      documents: DOCUMENTS.map((d) => ({ ...d, projectId: id })),
      events: [],
      projectId: id,
    });
    const event = {
      ...read("Expected a decision point, found a drift.", sources, digest),
      projectId: id,
    };
    const store = await storeWith([event]);
    const { host, root } = await mount(
      React.createElement(MotivationPage, { project, onChanged: () => undefined }),
      store,
    );

    // ISC-587: Starting point shows none of it, and has no box to type one in.
    expect(find(host, "framing-puzzle")).toBeNull();
    expect(host.textContent ?? "").not.toContain("found a drift");
    expect(find(host, "framing-research-question")).toBeNull();
    expect(find(host, "framing-preview")).toBeNull();
    root.unmount();

    const offer = await offerFor(id, store);
    expect(find(offer.host, "puzzle-offer-text")?.textContent ?? "").toBe(
      "Expected a decision point, found a drift.",
    );
    /* The places, then the moment (owner's walk of 2026-09-12): "Read the puzzle
     * doesn't do anything" was a second reading landing under a line that said
     * the same words as before it. The moment is `formatMoment`'s and is not
     * pinned here; the places and the shape are. */
    expect(find(offer.host, "puzzle-offer-source")?.textContent ?? "").toMatch(
      /^Suggested from Your starting interest, Context, Site, Early data and 3 passages, .+\.$/,
    );
    /* And no control (owner, 2026-09-12: "What does that button do? And how
     * should the user know?"). The reading is current, so a button would do
     * nothing the researcher could see. */
    expect(find(offer.host, "puzzle-offer-read")).toBeNull();
    offer.root.unmount();
  });

  test("and it says so when what it read has moved since", async () => {
    const id = "m40-band-stale";
    await study(id);
    const event = {
      ...read(
        "Expected a decision point, found a drift.",
        [{ kind: "answer", subject: "early-data" }],
        "a digest of something else",
      ),
      projectId: id,
    };
    const store = await storeWith([event]);
    const { host, root } = await offerFor(id, store);
    expect(find(host, "puzzle-offer-source")?.textContent ?? "").toContain(
      "Something that Abductive considered has changed since that suggestion.",
    );
    root.unmount();
  });

  test("a study with nothing saved says there is nothing to read, and offers the control", async () => {
    const id = "m40-band-empty";
    await projects.saveProject({
      id,
      title: "fresh",
      stage: "design-brief",
      createdAt: 1,
      brief: emptyBrief(),
    } as never);
    const project = (await projects.getProject(id)) as never;
    const store = new InMemoryLedgerStore();
    const page = await mount(
      React.createElement(MotivationPage, { project, onChanged: () => undefined }),
      store,
    );
    expect(page.host.textContent ?? "").not.toMatch(/puzzle/i);
    page.root.unmount();
    const { host, root } = await offerFor(id, store);
    expect(find(host, "puzzle-offer-source")?.textContent ?? "").toBe(
      "Abductive suggests the puzzle from your Early data and your answers at the steps. You haven't saved an answer for Abductive to consider yet.",
    );
    // And no control: with nothing saved there is nothing a reading could be made
    // of, and the line above says so in words.
    expect(find(host, "puzzle-offer-read")).toBeNull();
    root.unmount();
  });
});

// ---------------------------------------------------------------------------
// The writer
// ---------------------------------------------------------------------------

describe("the writer: one event, no bound row (ISC-509), and since M93 no mirror (ISC-763)", () => {
  beforeEach(() => {
    resetPuzzleReadingLoops();
    requests.length = 0;
    live = true;
    reply = "PUZZLE: I expected a decision point and found a drift.";
  });

  test("a mount over unread material reads once and writes both halves", async () => {
    const id = "m40-write-once";
    const project = await study(id);
    const store = await storeWith([]);
    /* Told, not just written (walk of 2026-09-12). The workbench holds a copy of
     * the brief that the prompts and the checks read the puzzle from, and it
     * learns of a change through this callback; a reading that wrote the field
     * and told nobody left the study bar printing nothing under a band printing
     * the reading. */
    let told = 0;
    const { host, root } = await mount(
      React.createElement(MotivationPage, {
        project,
        onChanged: () => {
          told += 1;
        },
      }),
      store,
    );
    expect(told).toBeGreaterThanOrEqual(1);

    const events: readonly LedgerEvent[] = await store.readAll();
    const readings = events.filter((e) => e.type === "puzzle-reading");
    // One reading, not two: the mount and the digest effect are one effect for
    // exactly this reason, and the loop serialises rather than dropping.
    expect(readings).toHaveLength(1);
    expect(readings[0]?.type === "puzzle-reading" && readings[0].text).toBe(
      "I expected a decision point and found a drift.",
    );
    /* M93, ISC-763: the field no longer mirrors the reading. The reading waits
     * for the researcher's decision, and only an accepted one becomes the
     * research question that the prompts and the exports read. */
    expect(readings[0]?.type === "puzzle-reading" && readings[0].awaitsDecision).toBe(true);
    expect((await projects.getProject(id))?.brief.researchQuestion).toBe("");
    /* And no `bound` row. A `bound` row is the researcher committing to a boundary
     * of their design; they committed to the answers this was read from, not to the
     * reading. One under `actor: "human"` would be the tool's sentence on the
     * bounding timeline as theirs, which the M37 rule forbids outright. */
    expect(events.filter((e) => e.type === "bound")).toHaveLength(0);
    // ISC-587: read here, and shown only at the Puzzle step.
    expect(host.textContent ?? "").not.toContain("found a drift");
    root.unmount();
    const offer = await offerFor(id, store);
    expect(find(offer.host, "puzzle-offer-text")?.textContent ?? "").toContain("found a drift");
    offer.root.unmount();
  });

  test("a second mount over the same material makes no call", async () => {
    const id = "m40-write-twice";
    const project = await study(id);
    const store = await storeWith([]);
    const first = await mount(
      React.createElement(MotivationPage, { project, onChanged: () => undefined }),
      store,
    );
    expect(requests.length).toBe(1);
    first.root.unmount();

    resetPuzzleReadingLoops();
    requests.length = 0;
    /* The brief as it is now, including the reading, which is what a second visit
     * loads. A study whose answers have not moved pays one storage read and no
     * model call at all: that is what `readingDue` is for. */
    const again = (await projects.getProject(id)) as never;
    const second = await mount(
      React.createElement(MotivationPage, { project: again, onChanged: () => undefined }),
      store,
    );
    expect(requests.length).toBe(0);
    const stored: readonly LedgerEvent[] = await store.readAll();
    expect(stored.filter((e) => e.type === "puzzle-reading")).toHaveLength(1);
    second.root.unmount();
  });

  test("a NONE result empties the field and records the reason", async () => {
    const id = "m40-write-none";
    reply = "NONE: Nothing saved yet says what you expected.";
    const project = await study(id, { researchQuestion: "a puzzle from before" });
    const store = await storeWith([]);
    const { root } = await mount(
      React.createElement(MotivationPage, { project, onChanged: () => undefined }),
      store,
    );
    const all: readonly LedgerEvent[] = await store.readAll();
    const found = all.find((e) => e.type === "puzzle-reading");
    expect(found?.type === "puzzle-reading" && found.text).toBe("");
    expect(found?.type === "puzzle-reading" && found.none).toBe(
      "Nothing saved yet says what you expected.",
    );
    /* M93, ISC-763: the research question changes only by the researcher's
     * decision, so a reading that found none leaves it as it was. */
    expect((await projects.getProject(id))?.brief.researchQuestion).toBe("a puzzle from before");
    root.unmount();
    const offer = await offerFor(id, store);
    expect(find(offer.host, "puzzle-offer-source")?.textContent ?? "").toContain("Your puzzle is still to come.");
    offer.root.unmount();
  });

  test("the control reads when the tool could not, and an edit to the Early data answer reads again on its own", async () => {
    const id = "m40-write-again";
    const project = await study(id);
    const store = await storeWith([]);
    /* No model when the reading was due, so nothing was read on its own and the
     * control is offered, named for the act. That is the one occasion it exists
     * for (owner, 2026-09-12): a reading that is wanted and did not happen by
     * itself. With a current reading there is no control at all, which the
     * "shows the reading" test holds. */
    live = false;
    const { host, root } = await mount(
      React.createElement(MotivationPage, { project, onChanged: () => undefined }),
      store,
    );
    expect(requests.length).toBe(0);
    /* M58, ISC-567: the control moved to The puzzle step. ISC-587: and Starting
     * point no longer points there either; it shows nothing of the puzzle. */
    expect(find(host, "framing-puzzle-read")).toBeNull();
    expect(find(host, "framing-puzzle-step")).toBeNull();
    root.unmount();

    const offer = await mount(
      React.createElement(PuzzleOffer, {
        projectId: id,
        brief: (project as { brief: never }).brief,
        events: [],
        chunks: [],
        documents: [],
        onChanged: () => undefined,
      }),
      store,
    );
    expect(find(offer.host, "puzzle-offer-read")?.textContent).toBe(
      "Suggest a puzzle from my saved answers",
    );
    reply = "PUZZLE: A puzzle, after they pressed it.";
    await act(async () => {
      press(find(offer.host, "puzzle-offer-read"));
    });
    for (let i = 0; i < 10; i += 1) await act(async () => await wait(5));
    expect(requests.length).toBe(1);
    const once: readonly LedgerEvent[] = await store.readAll();
    expect(once.filter((e) => e.type === "puzzle-reading")).toHaveLength(1);
    offer.root.unmount();
    // Read and current now: drawn from the record, the reading is offered with
    // its question and the control is gone.
    const read = await mount(
      React.createElement(PuzzleOffer, {
        projectId: id,
        brief: ((await projects.getProject(id)) as { brief: never }).brief,
        events: once,
        chunks: await projects.listChunks(id),
        documents: await projects.listDocuments(id),
        onChanged: () => undefined,
      }),
      store,
    );
    expect(find(read.host, "puzzle-offer-text")?.textContent).toBe("A puzzle, after they pressed it.");
    expect(read.host.textContent).toContain("Is this the surprise that current accounts can't explain?");
    expect(find(read.host, "puzzle-offer-read")).toBeNull();
    read.root.unmount();
    live = true;

    /* And the digest moving is the other occasion. A step saves, so what the tool
     * read is no longer what is there, and the reading follows the answers rather
     * than sitting under them going stale. */
    resetPuzzleReadingLoops();
    requests.length = 0;
    reply = "PUZZLE: A third puzzle, after the Early data moved.";
    await projects.updateBrief(id, { earlySurprise: "the sheet was full and nobody read it" });
    const moved = (await projects.getProject(id)) as never;
    const after = await mount(
      React.createElement(MotivationPage, { project: moved, onChanged: () => undefined }),
      store,
    );
    expect(requests.length).toBe(1);
    after.root.unmount();
  });

  test("with no model attached nothing is read and nothing is claimed", async () => {
    /* The same guard the paper judge makes. With nothing connected
     * `activeInferenceClient` hands back a mock, and recording what it said would
     * be the tool putting a sentence about the researcher's own study in front of
     * them on the strength of a canned string. */
    live = false;
    const id = "m40-write-offline";
    const project = await study(id);
    const store = await storeWith([]);
    const { root } = await mount(
      React.createElement(MotivationPage, { project, onChanged: () => undefined }),
      store,
    );
    expect(requests.length).toBe(0);
    const none: readonly LedgerEvent[] = await store.readAll();
    expect(none.filter((e) => e.type === "puzzle-reading")).toHaveLength(0);
    root.unmount();
    // And the Puzzle step says it has not been read (ISC-587: said there, not here).
    const offer = await offerFor(id, store);
    expect(find(offer.host, "puzzle-offer-source")?.textContent ?? "").toBe("Not suggested yet.");
    offer.root.unmount();
  });

  test("Anti: a conversation turn is never a source and never triggers a reading", async () => {
    /* Turns are not sources. A reading is held against what the researcher has
     * saved, and a turn is something they said on the way to saving it: reading the
     * puzzle out of the conversation would make the tool's reading move every time
     * they typed a sentence they had not committed to. */
    const id = "m40-write-turns";
    const project = await study(id);
    const turn = {
      id: uid(),
      ts: 1_700_000_000_001,
      actor: "human",
      projectId: id,
      type: "response",
      text: "I think the real puzzle is about who signs off at the end of a shift.",
      station: "framing",
    } as LedgerEvent;
    const store = await storeWith([turn]);
    const { root } = await mount(
      React.createElement(MotivationPage, { project, onChanged: () => undefined }),
      store,
    );
    const one = requests.length;
    const system = requests[0]?.system ?? "";
    expect(system).not.toContain("who signs off");
    root.unmount();

    // A second turn is not a change the reading follows.
    resetPuzzleReadingLoops();
    const another = { ...turn, id: uid(), text: "Or maybe it is about the sign-off." } as LedgerEvent;
    await store.append(another);
    const again = await mount(
      React.createElement(MotivationPage, { project, onChanged: () => undefined }),
      store,
    );
    expect(requests.length).toBe(one);
    again.root.unmount();
  });
});

// ---------------------------------------------------------------------------
// D21 (M43b): a reading of the study as it is now is not stale
// ---------------------------------------------------------------------------

/**
 * The dock holds one corpus and the writer reads another (D21, M43b).
 *
 * The walk of 2026-09-13 pressed "Suggest the puzzle again from my saved answers"
 * and the line under the new reading still said "Something the tool read has
 * moved since", with a control beside it offering to do it again. Four readings
 * were written over two legs and the flag never cleared.
 *
 * The cause is two readers of one corpus. `usePuzzleReading` reads the documents
 * and passages fresh from storage inside its loop, so it stamps a digest over the
 * material as it stands. The band computed its own digest from a corpus it had
 * loaded in an effect keyed on the study alone, and the band is the shell's,
 * mounted once per study across all five tabs: material added on Material never
 * reached it. So the reading covered the answers and three passages, the band's
 * digest covered the answers and none, and the two could not compare equal.
 */
describe("a reading made of the study as it stands is not stale (D21)", () => {
  beforeEach(() => {
    resetPuzzleReadingLoops();
    requests.length = 0;
    live = true;
    reply = "PUZZLE: I expected a decision point and found a drift.";
  });

  test("the band re-reads its corpus when material lands, and the flag clears", async () => {
    const id = "m43b-stale-corpus";
    /* A study with answers and no material, which is the state the band mounts in
     * when a researcher opens a study and then goes to Material to upload. */
    await projects.saveProject({
      id,
      title: "night wards",
      stage: "design-brief",
      createdAt: 1,
      brief: brief(),
    } as never);
    const project = (await projects.getProject(id)) as never;
    const store = await storeWith([]);
    const { host, root } = await mount(
      React.createElement(MotivationPage, { project, onChanged: () => undefined }),
      store,
    );
    // One reading, of the answers alone.
    expect(requests.length).toBe(1);

    /* The material arrives on the Material tab, which writes to storage and
     * announces the study changed. Before this fix the band heard nothing and went
     * on holding an empty corpus for the life of the tab. */
    for (const d of DOCUMENTS) await projects.saveDocument({ ...d, projectId: id });
    await projects.saveChunks(CHUNKS.map((c) => ({ ...c, projectId: id })));
    await act(async () => {
      announceHere(id);
      await wait(5);
    });
    for (let i = 0; i < 14; i += 1) {
      await act(async () => {
        await wait(5);
      });
    }

    /* The corpus is a change to what there is to read, so a reading is due and the
     * band takes it. What matters is the state it lands in: the new reading covers
     * the passages, and the Puzzle step's line under it (ISC-587: the reading is
     * shown there, not here) does not say its own inputs have moved. */
    expect(requests.length).toBe(2);
    expect(find(host, "framing-puzzle")).toBeNull();
    expect(host.textContent ?? "").not.toContain("found a drift");
    const events: readonly LedgerEvent[] = await store.readAll();
    const readings = events.filter((e) => e.type === "puzzle-reading");
    const last = readings[readings.length - 1];
    if (last?.type !== "puzzle-reading") throw new Error("no reading written");
    expect(last.sources.filter((s) => s.kind === "passage").length).toBeGreaterThan(0);
    root.unmount();
    const offer = await offerFor(id, store);
    const line = find(offer.host, "puzzle-offer-source")?.textContent ?? "";
    expect(line).toContain("passages");
    expect(line).not.toContain("has changed since");
    offer.root.unmount();
  });

  test("the digest the band compares is the digest the writer stamped", () => {
    /* The property under the symptom, stated once: a reading whose digest was taken
     * over the same brief, corpus and record cannot read as stale. Every way the two
     * sides can differ is a way this fails. */
    const shape = input();
    const { sources, digest } = reading.puzzleSources(shape);
    const state: PuzzleState = reading.puzzleState({
      ...shape,
      events: [read("Expected a point, found a drift.", sources, digest)],
    });
    expect(state.kind).toBe("read");
    if (state.kind !== "read") throw new Error("not read");
    expect(state.stale).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D21 (M43b): which passages, and why three
// ---------------------------------------------------------------------------

describe("the line says how much of the corpus a reading covers (D21)", () => {
  test("three of twelve says what was left out", () => {
    expect(reading.passageCoverageLine(3, 12)).toBe(
      "Abductive considers at most 3 passages of your sources, the passages that you've opened most often. Abductive excludes the other 9 passages from this suggestion.",
    );
  });

  test("a corpus the reading covers whole claims nothing was left out", () => {
    expect(reading.passageCoverageLine(3, 3)).toBe(
      "Abductive considers at most 3 passages of your sources, the passages that you've opened most often.",
    );
  });

  test("one passage left out reads in the singular", () => {
    expect(reading.passageCoverageLine(3, 4)).toContain("Abductive excludes the other 1 passage from this suggestion.");
  });

  test("a reading made of answers alone says nothing about passages", () => {
    expect(reading.passageCoverageLine(0, 12)).toBe("");
  });

  test("the band prints the coverage beside what the reading was read from", async () => {
    const shape = input();
    const { sources, digest } = reading.puzzleSources(shape);
    const state = reading.puzzleState({
      ...shape,
      events: [read("Expected a point, found a drift.", sources, digest)],
    });
    const line = band.puzzleSourceLine(state, { reading: false, error: null });
    expect(line).toContain("Suggested from Your starting interest");
    expect(line).toContain("and 3 passages");
    // M61, decision 6: how much the reading covers is not on the line beside it.
    expect(line).not.toContain("Abductive reads at most");
    expect(reading.passageCoverageLine(3, 4)).toContain("Abductive considers at most 3 passages of your sources");
    /* ISC-587: the fold that printed it left Starting point with the rest of the
     * block, and the Puzzle step was kept exactly as M58 built it, so no surface
     * prints the coverage now. The sentence and its rule stay here, tested, for
     * the step to take up if the owner wants it there. */
    const src = await Bun.file(new URL("../src/flow/FramingBand.tsx", import.meta.url).pathname).text();
    expect(src).not.toContain("framing-puzzle-coverage");
    /* Four data passages in the fixture and three in every digest, which is what
     * the cap is: the count of what is outside the reading comes from the corpus. */
    expect(reading.passageCoverageLine(3, 4)).toContain("Abductive excludes the other 1 passage from this suggestion.");
  });
});
