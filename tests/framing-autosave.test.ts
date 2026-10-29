/**
 * The framing band's autosave, after the live walk lost fields to it.
 *
 * Two independent defects, and the walk hit both. A blur that arrived while an
 * earlier save was still running was dropped by an in-flight boolean, and the
 * earlier save ended with a model call, so the window was tens of seconds wide.
 * And every save wrote the whole brief from the copy the component was holding
 * when it last rendered, so a save that did land rolled back whatever had been
 * written since that render.
 *
 * These hold the three properties that fix them: no request is dropped, no two
 * writes run at once, and every write is the band's current values laid over
 * whatever is on disk at that moment.
 *
 * Three fields since M40, not four. The puzzle left the band — it is the tool's
 * reading of the saved answers now, written by `flow/usePuzzleReading.ts` — so it
 * is no longer one of the values a blur carries, and `framingMerge` must not carry
 * it: a band that merged a puzzle it was holding at render time over a newer
 * reading would be exactly the second defect above, arriving on the one field the
 * researcher cannot see it happen to. That is asserted directly below.
 */

import { describe, expect, test } from "bun:test";
import {
  FRAMING_FIELD_ID,
  firstEmptyFraming,
  framingMerge,
  framingResync,
  serialise,
  type SaveLoop,
} from "../src/flow/FramingBand.tsx";
import { FRAMING_ASK, nextStep } from "../src/workbench/NextBar.tsx";
import { emptyBrief, type ProjectBrief } from "../src/state/projects.ts";
import { stationStates } from "../src/flow/stationBrief.ts";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The band and the store, wired the way the component wires them.
 *
 * `band` is what is in the three boxes right now, `store` is what is on disk,
 * and `write` is one pass of the save: read the store, lay the band's values
 * over it, put it back. The delay stands in for the round trip.
 */
function harness(delay = 5) {
  const store = { brief: emptyBrief(), writes: 0, concurrent: 0, peak: 0 };
  const band: { current: ProjectBrief } = { current: emptyBrief() };
  const loop: SaveLoop = { running: false, pending: false };
  const write = async () => {
    store.concurrent += 1;
    store.peak = Math.max(store.peak, store.concurrent);
    /* The read is the round trip, so the store is read at write time and not
     * at render time. That is the whole of the second defect: the component was
     * merging onto a snapshot taken whenever it last rendered. */
    await wait(delay);
    const held = band.current;
    const stored = store.brief;
    const next = framingMerge(stored, held);
    store.concurrent -= 1;
    if (JSON.stringify(next) === JSON.stringify(stored)) return false;
    store.brief = next;
    store.writes += 1;
    return true;
  };
  const blur = () => serialise(loop, write);
  return { store, band, blur };
}

describe("no blur is dropped", () => {
  test("three rapid blurs persist all three values", async () => {
    // The walk: exploring, venue, papers, each blurred by clicking the next. Two
    // of them came back empty after a reload.
    const { store, band, blur } = harness();
    const typed: readonly (readonly [keyof ProjectBrief, string])[] = [
      ["startingInterest", "night shifts on a ward"],
      ["targetVenue", "US management journals"],
      ["seminalCorpus", "Bechky 2006"],
    ];
    const inFlight: Promise<boolean>[] = [];
    for (const [field, value] of typed) {
      band.current = { ...band.current, [field]: value };
      inFlight.push(blur());
    }
    await Promise.all(inFlight);
    expect({
      startingInterest: store.brief.startingInterest,
      seminalCorpus: store.brief.seminalCorpus,
      targetVenue: store.brief.targetVenue,
    }).toEqual({
      startingInterest: "night shifts on a ward",
      seminalCorpus: "Bechky 2006",
      targetVenue: "US management journals",
    });
  });

  test("Anti: a blur never writes the puzzle (M40, ISC-508)", async () => {
    /* The band has no opinion about the puzzle and must not carry one. A reading
     * lands in `brief.researchQuestion` while the researcher is typing in the
     * venue box; a merge that included the field would put back whatever this
     * component was holding when it last rendered, silently reverting the tool's
     * own reading with no control anywhere that did it. */
    const { store, band, blur } = harness();
    store.brief = { ...store.brief, researchQuestion: "the reading the tool just wrote" };
    band.current = { ...band.current, researchQuestion: "a stale copy", targetVenue: "ASQ" };
    await blur();
    expect(store.brief.researchQuestion).toBe("the reading the tool just wrote");
    expect(store.brief.targetVenue).toBe("ASQ");
  });

  test("a blur during a slow save is written when the loop comes round", async () => {
    // The dropped-save case exactly: the first save is still in its model call
    // when the researcher leaves the second field.
    const { store, band, blur } = harness(20);
    band.current = { ...band.current, startingInterest: "night shifts" };
    const first = blur();
    await wait(1);
    band.current = { ...band.current, targetVenue: "US management journals" };
    const second = blur();
    await Promise.all([first, second]);
    expect(store.brief.targetVenue).toBe("US management journals");
    expect(store.brief.startingInterest).toBe("night shifts");
  });

  test("two writes never run at once", async () => {
    const { store, band, blur } = harness(10);
    const runs: Promise<boolean>[] = [];
    for (const value of ["a", "ab", "abc", "abcd", "abcde"]) {
      // The interest box rather than the puzzle, which is not a box any more.
      band.current = { ...band.current, startingInterest: value };
      runs.push(blur());
    }
    await Promise.all(runs);
    expect(store.peak).toBe(1);
    expect(store.brief.startingInterest).toBe("abcde");
  });

  test("blurring three untouched fields writes nothing at all", async () => {
    const { store, blur } = harness();
    await Promise.all([blur(), blur(), blur()]);
    expect(store.writes).toBe(0);
  });

  test("the caller that owns the loop is the one that reports the write", async () => {
    const loop: SaveLoop = { running: false, pending: false };
    let calls = 0;
    const write = async () => {
      calls += 1;
      await wait(5);
      return true;
    };
    const [first, second] = await Promise.all([serialise(loop, write), serialise(loop, write)]);
    expect({ first, second, calls }).toEqual({ first: true, second: false, calls: 2 });
  });
});

describe("every save is built on what is on disk now", () => {
  test("a station's answer written mid-blur is not rolled back", async () => {
    /* The band holds a copy of the brief from its last render. Writing that
     * copy back rolls every other field to what it was then, which is how a
     * venue typed a minute earlier disappeared. */
    const { store, band, blur } = harness(20);
    band.current = { ...band.current, startingInterest: "night shifts on one ward" };
    const saving = blur();
    // A station saves while the band's write is in the air.
    store.brief = { ...store.brief, siteRationale: "the only ward that would have me" };
    await saving;
    expect(store.brief.siteRationale).toBe("the only ward that would have me");
    expect(store.brief.startingInterest).toBe("night shifts on one ward");
  });

  test("the merge carries all three band fields and touches nothing else", () => {
    const stored: ProjectBrief = {
      ...emptyBrief(),
      siteRationale: "the ward",
      context: "nights",
      // The tool's reading, already on disk. Not the band's to carry (M40).
      researchQuestion: "the reading the tool wrote",
    };
    const band: ProjectBrief = {
      ...emptyBrief(),
      startingInterest: "night shifts",
      researchQuestion: "a stale copy of the reading",
      seminalCorpus: "Bechky 2006",
      targetVenue: "US management journals",
    };
    const merged = framingMerge(stored, band);
    expect(merged.siteRationale).toBe("the ward");
    expect(merged.context).toBe("nights");
    expect(merged.startingInterest).toBe("night shifts");
    expect(merged.seminalCorpus).toBe("Bechky 2006");
    expect(merged.targetVenue).toBe("US management journals");
    expect(merged.researchQuestion).toBe("the reading the tool wrote");
  });
});

describe("a fresh project arriving underneath the band", () => {
  test("takes the incoming value for a field nobody is editing", () => {
    const last: ProjectBrief = { ...emptyBrief(), startingInterest: "old" };
    const incoming: ProjectBrief = { ...last, startingInterest: "written elsewhere" };
    expect(framingResync(last, last, incoming).startingInterest).toBe("written elsewhere");
  });

  test("and a reading written under the band arrives whole (M40, ISC-508)", () => {
    /* The resync is per field and only for the fields the band owns, so the puzzle
     * is never held back: a reading stored while the researcher is typing in the
     * venue box is what the band shows on its next render. That is the property
     * that makes "read again" visible without a reload. */
    const last: ProjectBrief = { ...emptyBrief(), targetVenue: "AS" };
    const local: ProjectBrief = { ...last, targetVenue: "ASQ" };
    const incoming: ProjectBrief = { ...last, researchQuestion: "the reading" };
    const next = framingResync(local, last, incoming);
    expect(next.researchQuestion).toBe("the reading");
    expect(next.targetVenue).toBe("ASQ");
  });

  test("keeps what the researcher is in the middle of typing", () => {
    // The resync used to take the incoming brief whole, so a refresh landing
    // while somebody typed emptied the box under their hands.
    const last: ProjectBrief = { ...emptyBrief() };
    const local: ProjectBrief = { ...last, targetVenue: "US management jour" };
    const incoming: ProjectBrief = { ...last, siteRationale: "the ward" };
    const next = framingResync(local, last, incoming);
    expect(next.targetVenue).toBe("US management jour");
    expect(next.siteRationale).toBe("the ward");
  });
});

describe("the bar names the field it is asking for", () => {
  const settled = {
    station: "context" as const,
    pendingDrafts: 0,
    states: stationStates(emptyBrief(), 0),
    checksRun: false,
  };

  test("the first empty field of the three, in the order they are asked", () => {
    expect(firstEmptyFraming(emptyBrief())).toBe("startingInterest");
    expect(firstEmptyFraming({ ...emptyBrief(), startingInterest: "night shifts" })).toBe(
      "seminalCorpus",
    );
    expect(
      firstEmptyFraming({
        ...emptyBrief(),
        startingInterest: "night shifts",
        seminalCorpus: "Bechky 2006",
      }),
    ).toBe("targetVenue");
    /* And a puzzle, or the absence of one, moves nothing here (M40). The bar reads
     * this to decide where to send the caret, and there is no box to send it to. */
    expect(
      firstEmptyFraming({
        ...emptyBrief(),
        startingInterest: "night shifts",
        seminalCorpus: "Bechky 2006",
        targetVenue: "ASQ",
        researchQuestion: "",
      }),
    ).toBeUndefined();
  });

  test("Anti: a field holding only whitespace is empty", () => {
    expect(firstEmptyFraming({ ...emptyBrief(), startingInterest: "  \n " })).toBe(
      "startingInterest",
    );
  });

  test("the sentence and the caret name the same field, whichever it is", () => {
    // The walk: the bar asked for field one and put the caret in field one even
    // when field one was answered.
    const brief: ProjectBrief = { ...emptyBrief(), startingInterest: "night shifts" };
    const step = nextStep({ ...settled, brief });
    expect(step.rule).toBe("framing");
    expect(step.sentence).toBe(FRAMING_ASK.seminalCorpus);
    expect(step.action).toEqual({ kind: "focus", field: FRAMING_FIELD_ID.seminalCorpus });
  });

  test("every field has an ask, and every ask is one sentence pointing at a real box", () => {
    // The standing bar prefixes these with "Next for you:", so a second
    // sentence or a colon inside one reads as two instructions at once.
    for (const [field, id] of Object.entries(FRAMING_FIELD_ID)) {
      const ask = FRAMING_ASK[field as keyof typeof FRAMING_ASK];
      expect({
        field,
        ends: ask.endsWith("."),
        stops: ask.split(".").length - 1,
        colon: ask.includes(":"),
        box: id.startsWith("framing-"),
      }).toEqual({ field, ends: true, stops: 1, colon: false, box: true });
    }
  });
});
