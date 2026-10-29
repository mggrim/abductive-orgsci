/**
 * Source-discipline probes for the M8 anti-criteria (ISC-79, ISC-82, ISC-94,
 * ISC-106).
 *
 * These read source text rather than behaviour, which is the right instrument
 * for the failure modes they guard. Each one is a regression that would leave
 * the suite green and the tool wrong:
 *
 *   - a second hand-written list of station names drifting from the first
 *   - a `disabled` creeping onto a rail button, turning the spine into the
 *     staged wizard v2 was forked to escape
 *   - the ontology pane sliding inside the station switch, so the researcher's
 *     own model is off-screen while they answer questions about it
 *   - a CDN font or image, which puts a third-party host in the network log of
 *     every session and makes the data-locality claim tedious to defend
 */

import { describe, expect, test } from "bun:test";
import { GATED_STATIONS, LOOP_STATIONS, gateSentence, gatedStations, loopsSettled } from "../src/flow/loopGate.ts";
import { emptyBrief, normalizeBrief } from "../src/state/projects.ts";
import { declinedStations } from "../src/flow/stationBrief.ts";
import { dataChunkCount } from "../src/state/chunks.ts";
import type { StationId } from "../src/flow/stations.ts";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { STATIONS } from "../src/flow/stations.ts";
import { STUDY_TABS } from "../src/ui/routes.ts";

const ROOT = join(import.meta.dir, "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** Strip comments so a probe cannot be tripped by prose explaining itself. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|css|html)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("one declaration of the flow (ISC-79)", () => {
  test("station labels appear in the declaration and are read, never re-typed", () => {
    const sources = walk(join(ROOT, "src")).filter(
      (f) => !f.endsWith(join("flow", "stations.ts")),
    );
    for (const file of sources) {
      const body = code(readFileSync(file, "utf8"));
      /* A second literal list would have to name at least three of them in one
       * file to be a duplicate rail; anything less is incidental prose. The
       * assertion says three now, which is what that sentence always claimed
       * and what the number never was.
       *
       * D3 is why it had to. The labels lost "of interest" and "selection", so
       * "Process" became a bare English word, and the app already contains one:
       * `useHotkeys.ts` reads `e.key === "Process"`, which is the DOM's own key
       * value for an IME composition step and has nothing to do with a station.
       * A zero threshold makes any station whose label is a common word
       * unusable, which is a test dictating vocabulary rather than protecting
       * the property. The property is one declaration of the flow, and one
       * incidental collision is not a second declaration. */
      const hits = STATIONS.filter((s) => body.includes(`"${s.label}"`)).length;
      expect({ file, duplicateRail: hits >= 3 }).toEqual({ file, duplicateRail: false });
    }
  });

  test("Anti: the threshold still catches a hand-typed rail", () => {
    // Vacuity guard on the loosening above. A file that names three station
    // labels is a second rail whatever it calls itself.
    const rail = STATIONS.slice(0, 3)
      .map((s) => `"${s.label}"`)
      .join(", ");
    expect(STATIONS.filter((s) => rail.includes(`"${s.label}"`)).length).toBeGreaterThanOrEqual(3);
  });

  test("the station id union and the STATIONS array cannot diverge silently", () => {
    const declaration = read("src/flow/stations.ts");
    for (const station of STATIONS) {
      expect(declaration).toContain(`| "${station.id}"`);
    }
  });
});

/*
 * M58 (Matthew, 2026-09-27: "sample and early data are two external pieces that
 * are greyed out until the other bits are filled in"; the lead's ruling of the
 * same day) supersedes ISC-81 and ISC-82 for Sample and Early data only. The
 * suite now asserts both halves: no other station is ever disabled, hidden or
 * gated, and those two are gated only until each of the six loop steps has an
 * answer or was set aside.
 */
describe("the spine orients and gates only the two steps outside the loops (ISC-82, M58)", () => {
  test("Anti: no disabled attribute in the rail; a closed cell goes through the inert primitive", () => {
    const rail = code(read("src/flow/StationRail.tsx"));
    expect(rail).not.toMatch(/\bdisabled[=:]/);
    // M84 (the lead's ruling): the cell goes through the primitive with no tooltip,
    // and its note is read by a screen reader and not shown; Help says the rule.
    expect(rail).toContain("inertAttrs(control, gateSentence(station.id), { tooltip: false })");
    expect(rail).toContain("visuallyHidden");
  });

  test("the gate names exactly Sample and Early data, and waits on the six loop steps", () => {
    expect([...GATED_STATIONS]).toEqual(["sample", "early-data"]);
    expect([...LOOP_STATIONS]).toEqual(["context", "process", "outcome", "site", "puzzle", "bind"]);
  });

  test("no other station is gated, whatever the study holds", () => {
    const empty = emptyBrief();
    const answers: Record<string, string> = {
      context: "c", processOfInterest: "p", outcomeOfInterest: "o", siteRationale: "s", puzzleAnswer: "q", bind: "b",
    };
    const fields = Object.keys(answers);
    // Every subset of the six answered, and every subset of the six set aside.
    for (let mask = 0; mask < 64; mask += 1) {
      const brief = { ...empty } as Record<string, string>;
      fields.forEach((field, i) => {
        if ((mask & (1 << i)) !== 0) brief[field] = answers[field] as string;
      });
      for (const declined of [new Map(), new Map([["site", "not-applicable"]] as const)]) {
        for (const id of gatedStations(brief as never, declined as never)) {
          expect(["sample", "early-data"]).toContain(id);
        }
      }
    }
  });

  /* M69, ISC-641 (superseding ISC-626's wording): the two open once each of the
   * six has a saved answer. A set-aside written before M69 no longer counts. */
  test("the two open only once each of the six has a saved answer", () => {
    const brief = { ...emptyBrief() } as Record<string, string>;
    const declined = new Map<StationId, "not-yet" | "not-applicable">([
      ["outcome", "not-yet"],
      ["puzzle", "not-applicable"],
    ]);
    const steps: [string, () => void][] = [
      ["context", () => (brief.context = "c")],
      ["process", () => (brief.processOfInterest = "p")],
      ["site", () => (brief.siteRationale = "s")],
      ["bind", () => (brief.bind = "b")],
      ["outcome", () => (brief.outcomeOfInterest = "o")],
    ];
    for (const [, settle] of steps) {
      settle();
      expect(gatedStations(brief as never, declined).size).toBe(2);
    }
    // The sixth answer opens both.
    brief.puzzleAnswer = "q";
    expect(gatedStations(brief as never, declined).size).toBe(0);
    expect(loopsSettled(brief as never)).toBe(true);
  });

  /* The lead's ruling of 2026-09-27, option B: a gated step that already holds
   * work never closes; a fresh study gets the full gate. */
  test("a step that already holds work never closes (option B)", async () => {
    const fresh = emptyBrief();
    const none = new Map<StationId, "not-yet" | "not-applicable">();
    // Fresh: both closed.
    expect([...gatedStations(fresh, none, { events: [], projectId: "p", dataCorpusSize: 0 })].sort()).toEqual([
      "early-data",
      "sample",
    ]);
    // An older study with one conversation turn at Early data: Early data stays open.
    const turn = {
      id: "5f0c1d2e-3f40-4a51-8b62-7c83d94e0f19",
      ts: 1,
      actor: "persona:interviewer",
      model: "m",
      modelVersion: "m",
      projectId: "p",
      type: "response",
      text: "What has your material shown you?",
      station: "early-data",
    } as never;
    expect([...gatedStations(fresh, none, { events: [turn], projectId: "p", dataCorpusSize: 0 })]).toEqual(["sample"]);
    // A saved answer at Sample, or Sample set aside, keeps Sample open.
    expect([...gatedStations({ ...fresh, sampleRationale: "Two wards." }, none)]).toEqual(["early-data"]);
    expect([...gatedStations(fresh, new Map([["sample", "not-yet"]]))]).toEqual(["early-data"]);
    // The researcher's own data answers Early data (D12).
    expect([...gatedStations(fresh, none, { events: [], projectId: "p", dataCorpusSize: 3 })]).toEqual(["sample"]);

    // The shipped example, imported unchanged: no puzzle answer, and both open.
    const bundle = await Bun.file(new URL("./fixtures/coldharbour.bundle.json", import.meta.url).pathname).json();
    const brief = normalizeBrief(bundle.project.brief);
    expect(brief.puzzleAnswer ?? "").toBe("");
    const declined = declinedStations(bundle.events);
    expect(loopsSettled(brief)).toBe(false);
    const dataCorpusSize = dataChunkCount(bundle.chunks);
    expect([...gatedStations(brief, declined, { events: bundle.events, projectId: bundle.project.id, dataCorpusSize })]).toEqual([]);
  });

  /* M69, ISC-641: the rule, then the loop steps still without an answer. */
  test("every closed step says what opens it, and names the steps still open", () => {
    expect(gateSentence("sample")).toBe("Sample opens once you have answered all six steps in the loops.");
    expect(gateSentence("early-data")).toBe("Early data opens once you have answered all six steps in the loops.");
    expect(gateSentence("sample", ["context", "bind"])).toBe(
      "Sample opens once you have answered all six steps in the loops. Context and Bind still need an answer.",
    );
    expect(gateSentence("sample", ["site"])).toBe(
      "Sample opens once you have answered all six steps in the loops. Site still needs an answer.",
    );
  });

  test("Anti: the rail contains no conditional that could hide a station", () => {
    const body = code(read("src/flow/StationRail.tsx"));
    // A slice is always a truncation, so it stays banned outright.
    expect(body).not.toContain(".slice(");
    // `.filter(` used to be banned outright, as a proxy for the same thing.
    // M21 split the rail into a loop of four and an outer group of four, which
    // needs a partition, and a proxy that forbids the correct implementation
    // of the invariant is worse than no proxy. Partitioning on `ring` is
    // allowed; filtering on anything else is still how a station disappears.
    // The invariant itself is asserted in the next test.
    const filters = body.split("\n").filter((l) => l.includes(".filter("));
    for (const line of filters) expect(line).toContain("ring");
  });

  test("every station is rendered, whatever the rail's shape (ISC-82)", () => {
    // The real guarantee, asserted directly rather than through a ban on one
    // array method: partition the rail however you like, but the partitions
    // must cover STATIONS exactly, and neither may be empty.
    // M58: three partitions, the outer loop, the inner loop and the two outside.
    const outer = STATIONS.filter((s) => s.ring === "outer").map((s) => s.id);
    const inner = STATIONS.filter((s) => s.ring === "inner").map((s) => s.id);
    const external = STATIONS.filter((s) => s.ring === "external").map((s) => s.id);
    expect(outer).toEqual(["context", "process", "outcome", "site"]);
    expect(inner).toEqual(["puzzle", "bind"]);
    expect(external).toEqual(["sample", "early-data"]);
    expect([...outer, ...inner, ...external].sort()).toEqual(STATIONS.map((s) => s.id).sort());
  });

  test("Anti: every station has a ring, so none can fall out of both groups", () => {
    for (const station of STATIONS) {
      expect(["outer", "inner", "external"]).toContain(station.ring);
    }
  });
});

describe("the ontology is never unmounted by a station change (ISC-94)", () => {
  const workbench = read("src/workbench/Workbench.tsx");

  test("the Design view renders no ontology surface that adjudicates", () => {
    // Restated three times now, and weakened none of them. The original asserted
    // the ontology pane sits in the Design view's context pane, which is where
    // it lived when the test was written. What it was protecting is that a
    // station change must not remount the researcher's model underneath them,
    // dropping the selection and re-running the force layout.
    //
    // The ontology, the tray and the baseline all moved to views of their own
    // (ISC-376, ISC-379, ISC-380) and Design became one column. Asserting the
    // old position would be pinning a layout in place of the property, so what
    // was pinned was that no ontology surface had crept back.
    //
    // M39 (ISC-503) is the third restatement, and it is the one that changes the
    // list rather than only the wording, so the reason is recorded here rather
    // than left in a commit message. Matthew's decision of 2026-09-10: "A
    // read-only copy of your model may sit beside the conversation on Design:
    // claims, links and the map, with no accept, decline, retire or withdraw
    // control, and the drafts queue staying on Your model; the M26c test is
    // restated with that reason rather than removed."
    //
    // Two things make that compatible with what this test has always held.
    //
    // The remount property is untouched and is asserted below: the companion is
    // a sibling of `.station-pane`, created by Workbench's own render, so a
    // station change reconciles it exactly as it reconciles the dialogue.
    //
    // M26c's argument was about *adjudication* — "adjudicating what your model
    // contains, in the same glance as a question about your site, is being asked
    // to do two jobs at once" — and a read-only companion does not adjudicate.
    // So the ban stays exactly where that argument reaches: the drafts tray, the
    // page detail panel with its accept and retire controls, the baseline behind
    // its reveal gate, and the force layout. What it no longer covers is a list
    // of claims with nothing to press, and `tests/design-panes.test.ts` holds
    // that half by scanning the rendered DOM of all three companions for a
    // control that accepts, declines, retires or withdraws.
    expect(workbench.indexOf('data-testid="station-pane"')).toBeGreaterThan(-1);
    for (const surface of ["<OntologyGraphView", "<PagePanel", "<ProposalsTrayView", "<TwinPanel"]) {
      expect(workbench).not.toContain(surface);
    }
  });

  test("the companion is a sibling of the station pane, so a station change reconciles it", () => {
    // The half of the M26c guarantee that M39 leans on, asserted directly rather
    // than implied by the ban above. It is the same claim made of the dialogue
    // one test down, about the same component, for the same reason: created by
    // Workbench's render, it keeps its position in that component's tree, so
    // moving along the rail reconciles it instead of dropping the selection and
    // re-settling anything inside it.
    const pane = workbench.indexOf('data-testid="station-pane"');
    expect(pane).toBeGreaterThan(-1);
    // M59, ISC-572: the companion went, so there is nothing beside the pane to
    // reconcile, and nothing mounts one again.
    expect(workbench).not.toContain("<DesignCompanion");
  });

  test("the ontology is reachable from every station", () => {
    // The half of the commitment that survives the move: the researcher must
    // never be making claims about a model they cannot get to. The tab bar is
    // rendered for the whole study rather than per station, so the route is
    // present at all eight; and the standing bar says so in words the moment
    // anything is waiting there.
    expect(STUDY_TABS).toContain("ontology");
    // The NextBar is the pointer from Design (D4, M27): it renders in the
    // standing header (since 2026-09-12; at the foot before that), outside the
    // station switch, so it is present at every step, and it names the tab the
    // drafts are waiting in with a control.
    // M28: copy. The bar names the tab through its control ("Review suggestions" going
    // to the ontology tab) and says the drafts are waiting for a decision.
    // R3, copy C6: the bar names the object in full on first mention, because
    // it is the first noun a returning reader meets on the page.
    expect(read("src/workbench/NextBar.tsx")).toContain("to review");
    expect(read("src/workbench/NextBar.tsx")).toContain('tab: "ontology"');
    // Mounted by the standing header, which the workbench renders at every step;
    // the workbench hands it the step rather than mounting it a second time.
    expect(read("src/workbench/OutstandingBar.tsx")).toContain("<NextBar");
    expect(read("src/workbench/Workbench.tsx")).toContain("<OutstandingBar");
    expect(read("src/workbench/Workbench.tsx")).not.toContain("<NextBar");
  });

  test("the dialogue is a sibling of the station, never inside it (ISC-229)", () => {
    // It moved into the station column at M14 so the question, the answer and
    // the record are one column. Inside `StationWorkspace` it would remount on
    // every station change and drop an in-flight streaming answer; as a
    // sibling it reconciles and survives. The upper bound used to be the
    // context pane, which no longer exists, so the claim is now made directly
    // against the component it must not be inside.
    const dialogue = workbench.indexOf("<Dialogue");
    const workspace = workbench.indexOf("<StationWorkspace");
    expect(dialogue).toBeGreaterThan(workbench.indexOf('data-testid="station-pane"'));
    expect(dialogue).toBeGreaterThan(workspace);
    expect(read("src/flow/StationWorkspace.tsx")).not.toContain("<Dialogue");
  });

  test("nothing in the workbench body branches on the focused station", () => {
    // This used to slice from the context pane, which no longer exists, so
    // `indexOf` returned -1 and the slice silently measured the last character
    // of the file. It passed, and it was checking nothing. A vacuous guard is
    // worse than no guard: it reads as coverage.
    const start = workbench.indexOf('className="workbench-body');
    expect(start).toBeGreaterThan(-1);
    /* The end marker has been three things and each time for the same reason: it
     * has to be an element this file still renders, because an `indexOf` that
     * returns -1 makes `slice` measure the whole file minus one character, which
     * passes and checks nothing, and this test's own header says a vacuous guard is
     * worse than no guard.
     *
     * It was `<Instrumentation`, which M38 removed: the record is one control in the
     * study header now and a second mount at the foot of Design would be two panels
     * claiming to be one record. Then `<FramingBand`, while the band was this main's
     * last child. M41 took that out too — the framing is the shell's footer dock, on
     * all five tabs, because the owner asked for "a bar just like the menu bar at the
     * left but as a footer bar that is always present" — so the marker is the close
     * of the main itself, which is the one thing this file cannot stop rendering. */
    const end = workbench.indexOf("</main>");
    expect(end).toBeGreaterThan(start);
    const body = code(workbench.slice(start, end));
    expect(body).not.toContain("station ===");
    expect(body).not.toContain("station ?");
  });
});

describe("no asset is fetched from anywhere (ISC-106)", () => {
  /**
   * The three hosts the app may legitimately reach, and only these:
   *
   *   - `api.anthropic.com` — the researcher's own model calls
   *   - `claude.ai` / `console.anthropic.com` — the OAuth handshake for the
   *     token they supply themselves
   *
   * ISC-71 permits the user's provider; what this probe forbids is a *fourth*
   * host, and in particular a font, image, or stylesheet CDN. Those would put
   * a third-party request in the network log of every session and make the
   * data-locality claim tedious to defend to a reviewer.
   *
   * Localhost is the dev server and the CLI bridge. `www.w3.org` is the SVG
   * namespace — an XML identifier, never fetched.
   *
   * `bun.sh` (M54) is text the Claude access card shows for the reader to paste
   * into their own terminal when Bun is missing (`auth/bridgeSteps.ts`). The
   * page never requests it; it is a command, like the `curl` line beside it.
   *
   * M60 (ISC-580): Option B takes a key for OpenAI, Gemini or OpenRouter, and
   * the page calls the reader's own provider at its API host, which ISC-71
   * permits: `api.openai.com`, `generativelanguage.googleapis.com` and
   * `openrouter.ai`, each reached only when the reader connects that
   * provider's key. `api.example.com` is the placeholder in the address field,
   * a name reserved by RFC 2606 and never fetched.
   */
  const ALLOWED =
    /^https?:\/\/(localhost|127\.0\.0\.1|www\.w3\.org|api\.anthropic\.com|claude\.ai|console\.anthropic\.com|bun\.sh|api\.openai\.com|generativelanguage\.googleapis\.com|openrouter\.ai|api\.example\.com)([/:?#]|$)/;

  test("Anti: no host beyond the provider appears in any source, style, or html file", () => {
    const offenders: string[] = [];
    for (const file of [...walk(join(ROOT, "src")), join(ROOT, "index.html")]) {
      const body = code(readFileSync(file, "utf8"));
      for (const match of body.matchAll(/https?:\/\/[^\s"'`)]+/g)) {
        if (ALLOWED.test(match[0])) continue;
        offenders.push(`${file.replace(ROOT, "")}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the probe is not vacuous — it rejects a font CDN", () => {
    expect(ALLOWED.test("https://fonts.googleapis.com/css2?family=Inter")).toBe(false);
    expect(ALLOWED.test("https://cdn.jsdelivr.net/npm/x")).toBe(false);
    // and still admits the provider
    expect(ALLOWED.test("https://api.anthropic.com/v1/messages")).toBe(true);
  });

  test("Anti: no @import or url() pulling a remote stylesheet or font", () => {
    // Restated, not weakened. It read the single src/ui/styles.css, which the
    // foundations wave split into eleven files under src/ui/styles/; a probe
    // pointed at one path would have gone on passing while ten sheets went
    // unchecked. It now reads every stylesheet in the tree and names the one
    // that offends.
    const sheets = walk(join(ROOT, "src")).filter((f) => f.endsWith(".css"));
    expect(sheets.length).toBeGreaterThan(1);
    const offenders = sheets.filter((f) => {
      const css = readFileSync(f, "utf8");
      return css.includes("@import") || /url\(\s*["']?https?:/.test(css);
    });
    expect(offenders.map((f) => f.replace(ROOT, ""))).toEqual([]);
  });
});
