/**
 * M52-3, the rest of ISC-536: the paper row's count, and the visit that was not
 * a departure.
 *
 * Two of the three follow-ups the M49 to M51 screen read left open. The third,
 * the route-help chip on Design, is not here: measured on the running build at
 * 1100, 1280, 1495, 1600 and 1920 the chip sits inside `.workbench-head` with
 * its right edge on the head's own right edge at every width, is never clipped,
 * never overlaps the standing bar, and the document never scrolls horizontally.
 * The evidence is in the build report and the chip was left where M32c put it.
 *
 *   the count        an uploaded paper's row read "PASSAGES 92" beside its name.
 *                    ISC-530 took the five head chips and the four document-row
 *                    counts off Design and Material at M49 and this one
 *                    survived. Asserted on the rendered source, the way
 *                    m49-counts-off-working-tabs.test.ts asserts the other nine,
 *                    with the readability signals that read the same number
 *                    asserted as still there: a file the tool could not read
 *                    still says so.
 *   the departure    leaving Design for Material stamped the end of a visit the
 *                    reader had not ended, so coming back read "Since your last
 *                    visit to this study, 0 changes. Nothing in this study moved
 *                    since your last visit." Measured on the example at 1495.
 *                    The rule is a pure function now, so the cases below are the
 *                    rule rather than a rendering of it.
 */

import { describe, expect, test } from "bun:test";

import { leftTheStudy } from "../src/flow/SinceLastHere.tsx";
import { studyPath, placePath, literaturePath, motivationPath } from "../src/ui/routes.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const read = async (rel: string): Promise<string> => Bun.file(`${SRC}${rel}`).text();

/** Comments carry the reasoning and are not what a researcher reads. */
function rendered(text: string): string {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

const PAPERS_SRC = await read("flow/SeminalCorpus.tsx");
const PAPERS = rendered(PAPERS_SRC);

const STUDY = "aec0d8ce-e697-4f95-be37-237112c49769";
const OTHER = "11111111-2222-3333-4444-555555555555";

describe("M52-3: the paper row carries no passage count (ISC-536)", () => {
  test("no chip on the row counts a paper's passages", () => {
    // Vacuity first: the row still exists and still says what the file is, so
    // the absence below is an absence from a row that is on screen.
    expect(PAPERS).toContain('<StatusChip label="paper" />');
    expect(PAPERS).not.toContain('label="passages"');
    // Anchored on the opening tag: `[^>]*` unanchored runs from the import list
    // to `paperRowState`'s signature and matches text no reader ever sees.
    expect(PAPERS).not.toMatch(/<StatusChip[^>]*passages/);
  });

  test("the count is still read, for whether the file was readable at all", () => {
    // The two readings that stay. Both are about a file the tool could not
    // read, which is a thing the reader has to act on, rather than about how
    // much of a file it read, which is not.
    expect(PAPERS).toContain("paperRowState({");
    expect(PAPERS).toContain("passages: passagesByDoc.get(doc.id) ?? 0");
    expect(PAPERS).toContain("(passagesByDoc.get(doc.id) ?? 0) === 0");
    expect(PAPERS).toContain("literature-unreadable-");
  });

  // M63, the lead's rulings of 2026-09-30: the old model tab's MODEL left with it; superseded: "Anti: the tally is still in the tool, on the claim it stands behind"
});

describe("M52-3: a tab change inside a study is not leaving it (ISC-536)", () => {
  test("another tab of the same study is not a departure", () => {
    for (const hash of [
      studyPath(STUDY, "design"),
      studyPath(STUDY, "material"),
      studyPath(STUDY, "ontology"),
      studyPath(STUDY, "exports"),
      literaturePath(STUDY),
      studyPath(STUDY, "motivation"),
      motivationPath(STUDY),
      motivationPath(STUDY, "framing-venue"),
    ]) {
      expect({ hash, left: leftTheStudy(hash, STUDY) }).toEqual({ hash, left: false });
    }
  });

  test("another step of the same study is not a departure either", () => {
    for (const place of ["context", "site", "process", "outcome"] as const) {
      const hash = placePath(STUDY, place);
      expect({ hash, left: leftTheStudy(hash, STUDY) }).toEqual({ hash, left: false });
    }
  });

  test("anywhere outside the study is a departure", () => {
    for (const hash of [
      studyPath(OTHER, "design"),
      "#/",
      "",
      "#/studies",
      "#/settings",
      "#/biases",
      "#/nonsense/that/no/router/parses",
    ]) {
      expect({ hash, left: leftTheStudy(hash, STUDY) }).toEqual({ hash, left: true });
    }
  });

  test("the cleanup asks the question rather than stamping unconditionally", async () => {
    // The defect was one line: the cleanup called `mark()` on every unmount,
    // and this panel is mounted by Design alone. Read off the source because
    // the alternative is a rendered test of a `localStorage` write on an
    // unmount, which asserts happy-dom rather than the rule.
    const src = await read("flow/SinceLastHere.tsx");
    expect(src).toContain("if (leftTheStudy(window.location.hash, projectId)) mark();");
    // The page going away is still unconditional, because the page is going
    // away whatever the hash still says.
    expect(src).toContain('window.addEventListener("pagehide", mark)');
    expect(src).toContain('window.addEventListener("beforeunload", mark)');
  });
});
