/**
 * Who is allowed to write a brief, and what a write carries with it.
 *
 * The live walk lost a venue twice. The framing band's own save loop was not
 * the loser: driven against the real component and the real store, the exact
 * sequence persists both fields. What lost them is that three surfaces wrote
 * the *whole* brief from a copy of the project taken whenever they last
 * loaded one. The papers field on Material loads its project when the section
 * mounts and never again; a station's box writes everything beside it; and a
 * second browser tab open on the same study holds a copy as old as the tab.
 *
 * Any of those writing one field put nine others back to what they were at load
 * time, with no error, no conflict and nothing on screen. So no surface writes a
 * whole brief now: it names its own fields and the read and the write happen
 * inside one transaction.
 */

import "fake-indexeddb/auto";
import { describe, expect, test } from "bun:test";
import {
  emptyBrief,
  getProject,
  saveProject,
  updateBrief,
  type Project,
} from "../src/state/projects.ts";

const SRC = new URL("../src/", import.meta.url).pathname;

let n = 0;
async function study(over: Record<string, string> = {}): Promise<string> {
  const id = `study-${(n += 1)}`;
  await saveProject({
    id,
    title: "night wards",
    stage: "design-brief",
    createdAt: 1,
    brief: { ...emptyBrief(), ...over },
  } as Project);
  return id;
}

describe("a write names its own fields", () => {
  test("a field nobody named keeps whatever is on disk", async () => {
    /* The walk, in two lines. The band writes the venue; the papers field on
     * another tab writes the list from a copy that predates it. */
    const id = await study({ seminalCorpus: "Bechky 2006" });
    await updateBrief(id, { targetVenue: "A US management journal" });
    await updateBrief(id, { seminalCorpus: "Bechky 2006\nBarley 1986" });
    const stored = await getProject(id);
    expect({
      venue: stored?.brief.targetVenue,
      papers: stored?.brief.seminalCorpus,
    }).toEqual({
      venue: "A US management journal",
      papers: "Bechky 2006\nBarley 1986",
    });
  });

  test("clearing a box is a write, and not naming a field is not", async () => {
    // `undefined` means "I am not writing this", which a surface holding an
    // unset optional field sends all the time. `""` means the researcher
    // emptied the box, and it has to land.
    const id = await study({ targetVenue: "ASQ", startingInterest: "night shifts" });
    await updateBrief(id, { targetVenue: "", startingInterest: undefined });
    const stored = await getProject(id);
    expect({
      venue: stored?.brief.targetVenue,
      interest: stored?.brief.startingInterest,
    }).toEqual({ venue: "", interest: "night shifts" });
  });

  test("it reports what moved, so a caller can record the change and say so", async () => {
    const id = await study({ researchQuestion: "an old question" });
    const first = await updateBrief(id, { researchQuestion: "a new question" });
    expect({
      changed: first?.changed,
      before: first?.before.researchQuestion,
      after: first?.after.researchQuestion,
    }).toEqual({ changed: true, before: "an old question", after: "a new question" });
    // Blurring four untouched fields must write nothing and say nothing.
    const again = await updateBrief(id, { researchQuestion: "a new question" });
    expect(again?.changed).toBe(false);
  });

  test("Anti: a study that is not there is not created by writing to it", async () => {
    expect(await updateBrief("no-such-study", { targetVenue: "ASQ" })).toBeUndefined();
  });

  test("interleaved writers do not lose each other's fields", async () => {
    // Two tabs, or two surfaces in one tab, saving at the same moment. The read
    // and the write are one transaction, so neither can write a brief it read
    // before the other's write landed.
    const id = await study();
    await Promise.all([
      updateBrief(id, { targetVenue: "ASQ" }),
      updateBrief(id, { seminalCorpus: "Bechky 2006" }),
      updateBrief(id, { researchQuestion: "expected a point, found a drift" }),
    ]);
    const stored = await getProject(id);
    expect({
      venue: stored?.brief.targetVenue,
      papers: stored?.brief.seminalCorpus,
      puzzle: stored?.brief.researchQuestion,
    }).toEqual({
      venue: "ASQ",
      papers: "Bechky 2006",
      puzzle: "expected a point, found a drift",
    });
  });
});

describe("no surface writes a whole brief", () => {
  const WRITERS = [
    "flow/FramingBand.tsx",
    "flow/SeminalCorpus.tsx",
    "flow/StationWorkspace.tsx",
  ];

  test("the three surfaces that edit a brief all go through the one writer", async () => {
    for (const file of WRITERS) {
      const code = (await Bun.file(SRC + file).text())
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect({ file, uses: code.includes("updateBrief(") }).toEqual({ file, uses: true });
      // `saveProject` writes the record whole, which is the defect itself.
      expect({ file, whole: code.includes("saveProject(") }).toEqual({ file, whole: false });
    }
  });

  test("the vacuity guard: the scan read three real files", async () => {
    for (const file of WRITERS) {
      const code = await Bun.file(SRC + file).text();
      expect({ file, big: code.length > 2000 }).toEqual({ file, big: true });
    }
  });
});
