/**
 * The reading exports say what the screen says (FND-01, export half).
 *
 * Why this file exists rather than another case in `prose-discipline.test.ts`.
 * That file's export fixture at "what the exports write (FND-01)" builds a
 * five-event ledger in which every ontology-mutation is stamped
 * `origin: "author-prior"` and no title or body carries a dash, and it opens
 * with a vacuity guard asserting exactly that. It is a test of the writers'
 * own template strings, and it is a good one. It is structurally unable to see
 * the case that shipped: a model-drafted page body, accepted into the
 * researcher's ontology, carrying a U+2014 that `displayProse.ts` does not
 * scrub because its table has no entry for `ontology-mutation`. 987 tests
 * passed and `tsc --noEmit` exited 0 for four consecutive rounds with
 * `memo.md` measuring 4,159 characters and one em dash on the running app.
 *
 * So the fixture here is the inverse of that one: the ledger is deliberately
 * dirty, in the one field and with the one origin the shipped defect had, and
 * the assertion is that the graph the export writers are handed has already
 * been through `voicedGraph`. The first test is the vacuity guard in reverse,
 * proving the raw projection really does carry the character, so a later pass
 * cannot go green by accident.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { validateEvent } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { voicedGraph } from "../src/views/voicedGraph.ts";
import { buildOntologyMemo } from "../src/export/ontologyMemo.ts";
import { buildAgentGraph, serializeAgentGraph } from "../src/export/agentGraph.ts";
import { buildDiagramSvg } from "../src/export/diagram.ts";
import { buildWikiFiles } from "../src/export/wikiDirectory.ts";
import { buildBundle, parseBundle, serializeBundle } from "../src/export/bundle.ts";
import { buildLedgerExport, serializeLedgerExport } from "../src/export/ledgerJson.ts";
import {
  normaliseLedgerProse,
  restoreLedgerAsWritten,
} from "../src/ledger/displayProse.ts";

/**
 * Figure dash, en dash, em dash, horizontal bar.
 *
 * Two of them, because a `/g` regex carries `lastIndex` across `.test()` calls
 * and would have skipped every other file in the wiki filter below.
 */
const BANNED = /[‒–—―]/g;
const HAS_BANNED = /[‒–—―]/;

const PROJECT_ID = "8f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
let clock = 2_400_000_000_000;
function env(actor: string) {
  clock += 1000;
  return { id: crypto.randomUUID(), ts: clock, actor, projectId: PROJECT_ID };
}

/**
 * The sentence is the one measured on the fixture study, character for
 * character, so this test fails for the reason the app failed rather than for
 * a reason invented here.
 */
const DIRTY_BODY =
  "They would say I've made this sound like a communication problem, and it isn't — that's the misunderstanding I'm being told I have.";
const DIRTY_TITLE = "Handoff as rehearsal — not transfer";

const EVENTS = [
  {
    ...env("human"),
    type: "ontology-mutation",
    op: "create",
    targetId: "pg-puzzle",
    pageType: "puzzle",
    title: DIRTY_TITLE,
    // `model-proposed` is the whole point. The page is labelled as the model's
    // on its own detail card and was then exported under the researcher's name.
    origin: "model-proposed",
    body: DIRTY_BODY,
    supportingChunks: [],
  },
  {
    ...env("human"),
    type: "ontology-mutation",
    op: "create",
    targetId: "pg-theory",
    pageType: "theory",
    title: "Handoff as information transfer",
    // The second page on the shipped fixture is stamped `author-prior` and its
    // body is byte-identical to a persona proposal in the same ledger, which is
    // why the rewrite is not keyed on origin. An origin-keyed rule was tried and
    // measured: it left this one on screen.
    origin: "author-prior",
    body: "The two nurses agreed about the handoff itself — the content went over cleanly.",
    supportingChunks: [],
  },
  {
    ...env("human"),
    type: "ontology-mutation",
    op: "relate",
    targetId: "pg-puzzle->pg-theory",
    edge: { from: "pg-puzzle", to: "pg-theory", role: "contradicts" },
    origin: "author-prior",
    supportingChunks: [],
  },
] as unknown as readonly LedgerEvent[];

const PROJECT = {
  id: PROJECT_ID,
  title: "Handoffs on the night ward",
  createdAt: clock,
  brief: {
    researchQuestion: "How do patient stories change across the night shift handoff?",
    context: "An acute ward.",
    site: "One hospital.",
    process: "The handover.",
    outcome: "",
    dataType: "ethnographic",
    targetVenue: "A top management journal",
  },
} as unknown as Parameters<typeof buildOntologyMemo>[0]["project"];

const RAW = projectOntology(EVENTS, PROJECT_ID);
const VOICED = voicedGraph(RAW);

describe("the reading exports agree with the screen (FND-01)", () => {
  test("the fixture is a real ledger and it really is dirty", () => {
    // Two guards. The events must validate, so this is not testing a shape the
    // store would reject; and the raw projection must carry the character, so a
    // green run below means the voicing did it and not the fixture.
    for (const event of EVENTS) expect(validateEvent(event)).toEqual([]);
    // Named field by field rather than counted over the JSON, because each page
    // carries its own history and the same string is therefore present twice.
    expect(HAS_BANNED.test(RAW.pages.get("pg-puzzle")?.title ?? "")).toBe(true);
    expect(HAS_BANNED.test(RAW.pages.get("pg-puzzle")?.body ?? "")).toBe(true);
    expect(HAS_BANNED.test(RAW.pages.get("pg-theory")?.body ?? "")).toBe(true);
  });

  test("voicedGraph clears both pages, whatever their origin says", () => {
    const pages = [...VOICED.pages.values()];
    expect(pages).toHaveLength(2);
    expect(JSON.stringify(pages).match(BANNED) ?? []).toEqual([]);
    // Rewrite, never delete: the words on either side of the dash survive.
    const puzzle = VOICED.pages.get("pg-puzzle");
    expect(puzzle?.body).toContain("and it isn't");
    expect(puzzle?.body).toContain("that's the misunderstanding");
    expect(puzzle?.title).toContain("rehearsal");
    expect(puzzle?.title).toContain("not transfer");
  });

  test("the memo, the diagram, the agent graph and the wiki are all clean", () => {
    const memo = buildOntologyMemo({ project: PROJECT, graph: VOICED, events: EVENTS });
    expect(memo.length).toBeGreaterThan(200);
    expect(memo.match(BANNED) ?? []).toEqual([]);

    const svg = buildDiagramSvg(VOICED, { title: PROJECT.title });
    expect(svg).toContain("<svg");
    expect(svg.match(BANNED) ?? []).toEqual([]);

    const agent = serializeAgentGraph(
      buildAgentGraph({ project: PROJECT, graph: VOICED, events: EVENTS, chunks: [] }),
    );
    expect(agent.length).toBeGreaterThan(200);
    expect(agent.match(BANNED) ?? []).toEqual([]);

    /* The wiki, restricted to the files that read the graph.
     *
     * `index.md` and every `pages/*.md` are built from the projection, so the
     * voicing reaches them and they are held to the same zero. `log.md` is not
     * in the list on purpose: it renders each ledger event's own `title` field
     * rather than the page it produced, so no graph-level voicing can reach it.
     * It is the wiki's copy of the record, the way `ledger.json` is, and it is
     * excluded here as a decision that is written down rather than as a gap
     * nobody noticed. Reaching it means an entry for `ontology-mutation` in
     * `displayProse.ts`, which is another builder's file. */
    const wiki = buildWikiFiles({ project: PROJECT, graph: VOICED, events: EVENTS });
    expect(wiki.length).toBeGreaterThan(2);
    const fromGraph = wiki.filter((f) => f.path === "index.md" || f.path.startsWith("pages/"));
    expect(fromGraph.length).toBeGreaterThan(1);
    expect(fromGraph.filter((f) => HAS_BANNED.test(f.content)).map((f) => f.path)).toEqual([]);
  });

  test("the same writers fed the raw graph would fail, so this is not vacuous", () => {
    const memo = buildOntologyMemo({ project: PROJECT, graph: RAW, events: EVENTS });
    expect((memo.match(BANNED) ?? []).length).toBeGreaterThan(0);
  });

  test("StudyExports hands ExportBar the voiced graph, not wb.graph", async () => {
    /* A source assertion, and it is the load-bearing one.
     *
     * The three above pass on a build that ships the defect, because they call
     * the writers directly with a graph this file voiced. What was actually
     * broken for four rounds was one prop: `StudyViews.tsx` read
     * `graph={wb.graph}` and `ExportBar` destructures that single object into
     * all four writers. There is no DOM harness in this project to render the
     * route, so the wiring is asserted the way `prose-discipline.test.ts`
     * asserts the inference clients are wired: by Reading. */
    const src = await Bun.file(new URL("../src/ui/StudyViews.tsx", import.meta.url)).text();
    expect(src).toContain("voicedGraph");
    expect(src).toMatch(/const graph = useMemo\(\(\) => voicedGraph\(wb\.graph\), \[wb\.graph\]\)/);
    expect(src).toContain("graph={graph}");
    expect(src).not.toContain("graph={wb.graph}");
  });

  test("the exports lede states what the two record exports actually do", async () => {
    /* Restated, because the sentence it used to pin was itself false.
     *
     * The previous version asserted the lede said `ledger.json` and
     * `bundle.json` "are the record itself rather than a reading of it". Both
     * serialise the events `ExportBar` is handed, and those have already been
     * through `normaliseLedgerProse`, so both were readings for five event types
     * and the record for the sixth. The property worth protecting was never that
     * exact wording; it is that the page does not make a claim about the files
     * that the files do not honour. That is what is pinned now, and the two
     * `not.toContain` lines keep both retired claims from returning. */
    const src = await Bun.file(new URL("../src/ui/StudyViews.tsx", import.meta.url)).text();
    // JSX wraps the sentence across source lines, so the phrases are matched
    // against the paragraph with its whitespace collapsed the way a browser
    // collapses it.
    /* M28: copy. The lede was 54 words of build rationale about JSON escaping
     * on a screen somebody opened to download a file, and the property this
     * test protects is not that rationale. It is that the page makes no claim
     * about the files the files do not honour. The one claim it makes now, that
     * every file is written from the same record and says what the screen says,
     * is the claim `voicedGraph` at the ExportBar prop makes true, and the two
     * retired claims still cannot come back. What the two record exports do
     * about the banned character is asserted directly against the files, in the
     * describe block below this one, which is where it can actually be checked. */
    /* M32, R6. The lede left the page body for the `?` popover on the file
     * list's sub-header, still in this file and still word for word, so the
     * locator is the sentence's first words rather than the paragraph's old
     * class and indent. Everything asserted below is unchanged: the page still
     * makes exactly one claim about the files, and the two retired claims still
     * cannot come back. */
    // M62, ISC-600: the lede left the page for Export's Help panel.
    const help = await Bun.file(new URL("../src/ui/pageHelp.ts", import.meta.url)).text();
    expect(src).not.toContain("Export your project");
    const start = help.indexOf("Export your project");
    expect(start).toBeGreaterThan(0);
    const lede = help.slice(start, help.indexOf('"', start)).replace(/\s+/g, " ");
    // R3, copy C2. M61: the record is History, and the verb is Export.
    expect(lede).toContain("Every file comes from History, so every file matches the screen");
    expect(lede).toContain("every file matches the screen");
    expect(lede).not.toContain("cannot disagree with what is on screen");
    expect(lede).not.toContain("are the record itself rather than a reading of it");
  });
});

/**
 * The two record exports, which are the half `voicedGraph` cannot reach.
 *
 * `ledger.json` and `bundle.json` serialise events rather than the ontology
 * projection, so no amount of voicing at the graph fixes them. They were the
 * last two files carrying the character, and the fix is three parts, each of
 * which is a defect on its own: the `ontology-mutation` entry in
 * `displayProse.ts` normalises the reading, the `asWritten` bag keeps that from
 * costing the audit, and `recordJson.ts` writes what the bag holds as a JSON
 * escape so the artefact honours a rule with no exception clause. Normalising
 * without keeping the original silently edits the record; keeping the original
 * without encoding it ships the dash; encoding without normalising would hide
 * a live defect behind the encoder.
 */
describe("the record exports (FND-01, ledger half)", () => {
  const READ = normaliseLedgerProse(EVENTS);

  test("the read boundary clears the ontology bodies the graph voicing cannot see", () => {
    const dirty = EVENTS.filter((e) => HAS_BANNED.test(JSON.stringify(e)));
    expect(dirty.length).toBeGreaterThan(0);
    for (const event of READ) {
      const { asWritten: _kept, ...prose } = event as unknown as Record<string, unknown>;
      expect(HAS_BANNED.test(JSON.stringify(prose))).toBe(false);
    }
  });

  test("ledger.json is clean on disk and the record is still recoverable from it", () => {
    /*
     * Restated, and the line that moved is the one that used to assert the file
     * DID carry the character.
     *
     * The property being protected has always been two-sided: the record must
     * survive the reading being enforced on top of it, and nothing the tool
     * exports may carry a banned dash. The previous version protected the first
     * side and declared the second a deliberate exemption, on the argument that
     * `asWritten` quotes somebody else and is therefore evidence rather than
     * prose. Measured on the running fixture with `URL.createObjectURL` hooked,
     * that exemption was twelve em dashes in `ledger.json` and twelve in
     * `bundle.json`, four of them the tool's own interview questions whose
     * sources in `src/interview/moves.ts` already read as full stops. The rule
     * has no exception clause and a shipped artefact is where it is checked.
     *
     * Nothing is weakened: both sides are asserted, and the second is asserted
     * harder than before. The serialized file carries zero. The value a parser
     * reads back out of it still carries the model's original, character for
     * character, because `serializeRecord` writes the JSON escape rather than
     * the character and `JSON.parse` is its inverse. See recordJson.ts.
     */
    const json = serializeLedgerExport(buildLedgerExport(PROJECT_ID, READ, () => clock));
    expect(json.match(BANNED) ?? []).toEqual([]);
    // Concealment check. A file with zero occurrences would also be produced by
    // an encoder that dropped the provenance, so the parse has to bring the
    // character back and the restored events have to equal what was stored.
    const parsed = JSON.parse(json) as { events: LedgerEvent[] };
    expect((JSON.stringify(parsed).match(BANNED) ?? []).length).toBeGreaterThan(0);
    expect(restoreLedgerAsWritten(parsed.events)).toEqual(EVENTS);
    // And the envelope, because `ExportBar` used to ship a bare array while this
    // module sat unimported.
    expect((parsed as unknown as { format: string }).format).toBe("bounds-ledger");
    // The reading itself, still clean field by field outside the bag.
    for (const e of parsed.events) {
      const { asWritten: _kept, ...prose } = e as unknown as Record<string, unknown>;
      expect(HAS_BANNED.test(JSON.stringify(prose))).toBe(false);
    }
  });

  test("bundle.json is clean on disk although it carries the unread record", () => {
    /* The harder half. `bundleFromStores` restores `asWritten` before
     * serialising, so a bundle holds the model's sentence in the live field
     * rather than in a provenance bag, which is what makes an import install the
     * ledger rather than the reading. That is right and it is also why the file
     * measured twelve. Same treatment, same two-sided assertion. */
    const bundle = buildBundle({
      project: PROJECT as unknown as Parameters<typeof buildBundle>[0]["project"],
      documents: [],
      chunks: [],
      anomalies: [],
      twin: null,
      events: restoreLedgerAsWritten(READ),
    });
    expect(HAS_BANNED.test(JSON.stringify(bundle.events))).toBe(true);
    const file = serializeBundle(bundle);
    expect(file.match(BANNED) ?? []).toEqual([]);
    expect(parseBundle(file).events).toEqual(EVENTS);
  });

  test("importing a bundle restores the ledger, not the reading of it", () => {
    const bundle = buildBundle({
      project: PROJECT as unknown as Parameters<typeof buildBundle>[0]["project"],
      documents: [],
      chunks: [],
      anomalies: [],
      twin: null,
      events: READ,
    });
    const imported = parseBundle(serializeBundle(bundle));
    // Byte for byte the ledger the exporting researcher holds, which is the
    // claim `importBundle` has always made and could not honour once the read
    // boundary started rewriting fields on the way out.
    expect(imported.events).toEqual(EVENTS);
    // And re-exporting the imported project reproduces the same file, because
    // the reading is re-derived deterministically from the restored row.
    const reexported = serializeBundle(
      buildBundle({
        project: PROJECT as unknown as Parameters<typeof buildBundle>[0]["project"],
        documents: [],
        chunks: [],
        anomalies: [],
        twin: null,
        events: normaliseLedgerProse(imported.events),
      }),
    );
    expect(reexported).toBe(serializeBundle(bundle));
  });

  test("the wiki's log.md is reached too, so no file is excluded any more", () => {
    /* The previous pass excluded `log.md` from the wiki assertion in writing,
     * because it renders each event's own `title` rather than the page the event
     * produced, and reaching it needed an entry in `displayProse.ts` that
     * belonged to another builder's file. There is no partition now and the
     * entry exists, so the exclusion goes and every wiki file is held to zero. */
    const wiki = buildWikiFiles({
      project: PROJECT,
      graph: voicedGraph(projectOntology(READ, PROJECT_ID)),
      events: READ,
    });
    expect(wiki.some((f) => f.path === "log.md")).toBe(true);
    expect(wiki.filter((f) => HAS_BANNED.test(f.content)).map((f) => f.path)).toEqual([]);
  });
});
