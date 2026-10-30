/**
 * The tool's own voice (ISC-177 … ISC-181) and the voice gate on the model's
 * (FND-01).
 *
 * The rule set is `PAI/USER/AI_WRITING_PATTERNS.md`. Its P2 dash rule is
 * absolute ("Never use em dashes or en dashes as punctuation. Zero
 * exceptions"), and there were 95 of them across 18 user-facing files before
 * this pass. Prose regresses under editing the way any other content does, so
 * the rules that can be checked mechanically are checked here.
 *
 * Scope used to be four directories of hand-written source, which left two
 * holes the survey found. The first was directories: `src/auth` was outside
 * the list, so the rule held everywhere except the one screen a new user must
 * visit before the tool does anything (SHL-03), and `src/views` and
 * `src/export` were outside it too. Those three are in scope now, quarantined
 * per file below and owned by other surfaces in this wave. The second hole was
 * bigger: nothing checked what the model writes. Source files are a small
 * fraction of what reaches the screen, and there was no sanitizer anywhere in
 * `src/`. `src/inference/voiceGate.ts` is that sanitizer and the last section
 * of this file holds it to its two contracts, rewriting rather than deleting,
 * and preserving provenance exactly.
 *
 * Deliberately excluded:
 *
 *  - `content/creeds/` — paraphrases that must read as Eisenhardt, Langley and
 *    Zuckerman, not as this tool's author.
 *  - `content/cases/` — synthetic briefs the eval harness scores against.
 *    `unrealistic-access-elite.md` says "trace how a deal moves" because it is
 *    a defective brief; fixing its prose would break the fixture.
 *  - Code comments, which are addressed to whoever maintains this and are not
 *    the tool speaking.
 *  - `src/matrix/matrix.ts` — the 29 intervention prompts. They are quoted
 *    verbatim on the bias page under "the exact prompt the persona receives",
 *    so they are visible, but they are instructions to a model rather than the
 *    tool addressing the researcher. Rewording them changes what the persona
 *    is told and therefore what it says, which is a methodological change and
 *    not a copy edit. Same reasoning as the creeds.
 */

import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import {
  applyVoiceGate,
  containsBannedDash,
  createStreamVoiceGate,
  normaliseModelProse,
  voiceGateProvenance,
} from "../src/inference/voiceGate.ts";
import { AnthropicInferenceClient } from "../src/inference/anthropic.ts";
import { CliBridgeInferenceClient } from "../src/inference/cliBridge.ts";
import { MockInferenceClient } from "../src/inference/mock.ts";
import { validateEvent, type LedgerEvent } from "../src/ledger/events.ts";
import { buildOntologyMemo } from "../src/export/ontologyMemo.ts";
import { buildSessionReplay } from "../src/export/sessionReplay.ts";
import { buildWikiFiles } from "../src/export/wikiDirectory.ts";
import { buildAgentGraph, serializeAgentGraph } from "../src/export/agentGraph.ts";
import { buildDiagramSvg } from "../src/export/diagram.ts";
import { buildBundle, serializeBundle } from "../src/export/bundle.ts";
import { buildLedgerExport, serializeLedgerExport } from "../src/export/ledgerJson.ts";
import { buildExportReceipt } from "../src/workbench/ExportBar.tsx";
import { voicedGraph } from "../src/views/voicedGraph.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { checkAllObligations } from "../src/ontology/relations.ts";
import {
  modelAuthoredFields,
  normaliseLedgerProse,
  restoreAsWritten,
} from "../src/ledger/displayProse.ts";
import type { CompleteRequest } from "../src/inference/types.ts";

const ROOT = new URL("../src/", import.meta.url).pathname;

/**
 * The four the rule always covered, plus everything the surveys found outside
 * it.
 *
 * The second survey put it plainly: the gate covered nine of src/'s eighteen
 * directories, and the exports it did not gate shipped 22 banned dashes to disk
 * between memo.md and session-replay.md. `src/ontology` was the sharpest case,
 * because `relations.ts` writes the detail string on every unmet obligation and
 * that string reaches both the lint findings on screen and the markdown
 * exports; the on-screen path was scrubbed at the ledger read boundary by
 * `normaliseLedgerProse` and the export path was not, so a DOM grep came back
 * clean while the file the researcher hands to a co-author did not.
 *
 * Every directory that can put a string in front of a person is listed. The two
 * that are not are `src/eval`, whose strings are a scoring report printed to a
 * terminal for whoever is tuning the harness rather than the tool addressing
 * the researcher, and `src/inference`, which is the gate itself and holds the
 * rewrite table.
 */
const ORIGINAL_DIRS = ["ui", "flow", "workbench", "matrix"];
const WIDENED_DIRS = [
  "auth",
  "views",
  "export",
  "interview",
  "ontology",
  "proposals",
  "personas",
  "twin",
  "state",
  "ledger",
  "attention",
  // M53, ISC-545: the study search prints group labels and result titles.
  "search",
  // M63, ISC-608: the emerging project ontology's vocabulary and field lines.
  "concepts",
  // M95: the About you labels; the help chat's prompt is model input, below.
  "help",
];
const DIRS = [...ORIGINAL_DIRS, ...WIDENED_DIRS];

/**
 * Files inside the scanned directories that are model input rather than the
 * tool's voice, on exactly the reasoning that exempts `matrix/matrix.ts`.
 *
 * `interview/prompt.ts` is the turn prompt and `interview/glean.ts` is the
 * page-type briefing the extractor is given. Rewording either changes what a
 * model is told and therefore what it says, which is a methodological change
 * and not a copy edit. Neither is ever rendered.
 */
const MODEL_INPUT_FILES = [
  "matrix/matrix.ts",
  "interview/prompt.ts",
  "interview/glean.ts",
  // The three the widened scan brought in, on the same reasoning: the page-type
  // briefing the extractor is handed, the persona question sets and project
  // brief the engine assembles, and the twin generator's instruction. All three
  // are what a model is told, none is ever rendered, and rewording any of them
  // changes what comes back rather than how it reads.
  "proposals/extract.ts",
  "personas/engine.ts",
  "twin/twin.ts",
  // M95: the help chat's system prompt, which a model reads and no page renders.
  "help/helpPrompt.ts",
];

/**
 * Files in the widened directories that carry a dash today, each owned by
 * another surface in this wave: `auth/AuthPanel.tsx` by App Shell (SHL-03),
 * the `views/` four by Instrumentation, the `export/` four by Material and
 * Exports.
 *
 * This is a ratchet, not an exemption. The assertion is exact equality, so a
 * new offender anywhere fails, and so does fixing one of these without
 * deleting its line. Both failures are the point: the first stops a
 * regression, the second stops the quarantine outliving the defect.
 */
const DASH_QUARANTINE: readonly string[] = [
  // Empty, and it stays empty. The eight files that were here are clean: the
  // four in `export/` and the four in `views/`. Emptying it was not tidying.
  // A DOM grep over ten routes came back with zero dashes while the export
  // blobs carried 22 between memo.md and session-replay.md, including headings
  // the tool writes itself ("# Session replay — ...", "## Response — human"),
  // because the quarantine had handed those four files to a surface builder who
  // had not arrived yet and nothing was measuring the files on the way out.
  // A ratchet with entries is a defect with a date on it.
];

async function sources(): Promise<readonly { path: string; text: string }[]> {
  const out: { path: string; text: string }[] = [];
  for (const dir of DIRS) {
    // `**` rather than `*`. The old pattern stopped at the first level, so
    // `src/ui/components` and `src/ui/keyboard` were inside a scanned directory
    // and outside the scan: the six shared primitives and the whole keyboard
    // model, including the ? sheet, were never read by any of these assertions.
    for await (const rel of new Glob("**/*.{ts,tsx}").scan(`${ROOT}${dir}`)) {
      if (MODEL_INPUT_FILES.includes(`${dir}/${rel}`)) continue; // see the note above
      out.push({ path: `${dir}/${rel}`, text: await Bun.file(`${ROOT}${dir}/${rel}`).text() });
    }
  }
  return out;
}

/** Strip block and line comments so only the tool's own voice is inspected. */
function rendered(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const FILES = await sources();

const dashOffenders = (): string[] =>
  FILES.filter((f) => /[—–]/.test(rendered(f.text)))
    .map((f) => f.path)
    .sort();

const inWidened = (path: string): boolean =>
  WIDENED_DIRS.some((d) => path.startsWith(`${d}/`));

/**
 * The three vocabulary checks read everything except the ban list itself.
 *
 * `personas/voice.ts` holds PROSE_CONTRACT and the array of patterns a persona
 * response is screened against, so it contains "heavy lifting", "in conclusion"
 * and the rest by construction. Exempting it from the vocabulary checks is the
 * same carve-out matrix.ts has and it is narrower: the file stays in the dash
 * scan, and it had to escape its own em-dash detector as \u2014 to get there.
 */
const BAN_LIST_FILES = ["personas/voice.ts"];
const vocabularyFiles = (): readonly { path: string; text: string }[] =>
  FILES.filter((f) => !BAN_LIST_FILES.includes(f.path));

describe("the tool's user-facing prose", () => {
  test("no em dash or en dash is used as punctuation (ISC-177)", () => {
    // Unchanged in strength: this is still zero offenders across ui, flow,
    // workbench and matrix. The filter narrows to exactly the set this
    // assertion always covered, so widening the scan cannot have weakened it.
    const offenders = dashOffenders().filter((p) => !inWidened(p));
    expect(offenders).toEqual([]);
  });

  test("no new dash offender appears in the newly covered directories (SHL-03)", () => {
    const unexpected = dashOffenders()
      .filter(inWidened)
      .filter((p) => !DASH_QUARANTINE.includes(p));
    expect(unexpected).toEqual([]);
  });

  test("a quarantined file that has been cleaned is removed from the list", () => {
    // If this fails, the named file no longer offends: delete its line from
    // DASH_QUARANTINE. The list is a handover to the surface that owns each
    // file, not a standing exemption, and the two halves together are exact
    // equality, so nothing can be added and nothing can be quietly kept.
    const stale = DASH_QUARANTINE.filter((p) => !dashOffenders().includes(p));
    expect(stale).toEqual([]);
  });

  test("Anti: the quarantine cannot be padded with files that do not offend", () => {
    // Restated, not weakened. It protected the same thing it always did, that a
    // quarantine listing clean files would let a real offender hide behind an
    // exact-equality assertion that never has to change. With the list empty
    // that loop is vacuous, so the property it was guarding is now stated
    // directly: nothing is exempt, and the three tests above are the whole rule.
    const scanned = new Set(FILES.map((f) => f.path));
    for (const path of DASH_QUARANTINE) {
      expect(scanned.has(path)).toBe(true);
      expect(inWidened(path)).toBe(true);
    }
    expect(DASH_QUARANTINE).toEqual([]);
  });

  test("the scan reaches every directory that puts a string in front of a person", async () => {
    // The hole this file kept having was never the rules, it was the window.
    // Four directories, then nine, and the survey found the exports shipping 22
    // dashes from the ten that were still outside. So the window is asserted
    // against the filesystem rather than maintained by hand: any new directory
    // under src/ has to be classified, either into DIRS or into the two
    // documented exclusions, before this passes.
    /* M69, ISC-644: `copy` holds the L13 to L20 detectors and the one-line rule
       texts the voice retry sends to the model, which is model input, as
       `inference` is; a researcher reads none of it. */
    const NOT_USER_FACING = ["inference", "copy"];
    const present: string[] = [];
    for await (const rel of new Glob("*/").scan({ cwd: ROOT, onlyFiles: false })) {
      present.push(rel.replace(/\/$/, ""));
    }
    const unclassified = present
      .filter((d) => !DIRS.includes(d) && !NOT_USER_FACING.includes(d))
      .sort();
    expect(unclassified).toEqual([]);
    // Vacuity guard: the walk has to have found the directories at all.
    expect(present.length).toBeGreaterThan(12);
  });

  test("the subdirectories of a scanned directory are scanned too", () => {
    // `*` stopped at the first level, so the shared primitives and the whole
    // keyboard model sat inside a covered directory and outside the coverage.
    const paths = FILES.map((f) => f.path);
    expect(paths).toContain("ui/components/DecisionGroup.tsx");
    expect(paths).toContain("ui/StudySearch.tsx");
  });

  test("no AI-tell vocabulary from the P2 list (ISC-178)", () => {
    // `quiet` is anchored against a preceding hyphen or word character. The
    // widened scan reached src/ui/components, where the decline control carries
    // className="btn-quiet" in three files: the button role FND-06 named, not
    // the adverb the P2 list bans. A class name is not prose, and the anti test
    // below holds the pattern to still firing on the word itself.
    const banned = /\bgenuinely\b|(?<![-\w])quiet(ly|er)?\b|\btrac(e|es|ed|ing)\b|\bheavy lifting\b|do(es|ing)? (the|real) work/i;
    const offenders = vocabularyFiles()
      .filter((f) => banned.test(rendered(f.text)))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  test("no P0 credibility killers (ISC-179)", () => {
    const banned = /it'?s important to note|feel free to|let me know if|i hope this helps|in conclusion|to summari[sz]e/i;
    const offenders = vocabularyFiles()
      .filter((f) => banned.test(rendered(f.text)))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  test("no P1 AI smell (ISC-180)", () => {
    const banned = /here'?s the thing|here'?s how it works|let'?s dive in|the cool part/i;
    const offenders = vocabularyFiles()
      .filter((f) => banned.test(rendered(f.text)))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  test("Anti: the checks are not vacuous", () => {
    // Each pattern must actually fire on the shape it is meant to catch,
    // otherwise a passing suite says nothing.
    expect(/[—–]/.test("a — b")).toBe(true);
    expect(/\bgenuinely\b/i.test("genuinely different")).toBe(true);
    // The anchored `quiet` still catches the word and no longer catches the
    // class, which is the whole of the narrowing.
    expect(/(?<![-\w])quiet(ly|er)?\b/i.test("it fails quietly")).toBe(true);
    expect(/(?<![-\w])quiet(ly|er)?\b/i.test("a quiet decline")).toBe(true);
    expect(/(?<![-\w])quiet(ly|er)?\b/i.test("className=\"btn-quiet\"")).toBe(false);
    // And the ban-list carve-out is one file, not a hole.
    expect(BAN_LIST_FILES).toEqual(["personas/voice.ts"]);
    expect(FILES.length - vocabularyFiles().length).toBe(1);
    expect(/it'?s important to note/i.test("It's important to note that")).toBe(true);
    expect(rendered("/* an — em dash in a comment */ const a = 1;")).not.toContain("—");
  });
});

describe("the verbatim carve-out is honest", () => {

  test("the carve-out is load-bearing, not cosmetic", async () => {
    /* This read "21 of the 29 prompts contain an em dash", and counted them: a
     * dashed prompt on screen is prose the rules missed unless the screen says
     * it is a quotation, so the count was the evidence that the `<code>` block
     * above is doing work.
     *
     * M48 took the dashes out at the cause. The brief's reason is the one the
     * copy standard's part 4 already gives: most of what a researcher reads is
     * written by the model, and the model copies the register it is given, so a
     * prompt punctuated with em dashes is a prompt asking for them. The voice
     * gate rewriting the model's dashes afterwards is a patch downstream of
     * that. Twenty-one of the twenty-nine paragraphs read the same with a
     * comma, a colon or a full stop, so they have one.
     *
     * The carve-out did not become cosmetic, so the count moved to what is
     * actually load-bearing and is not one punctuation pass away from being
     * untrue: these are instructions addressed to the model, in the tool's own
     * vocabulary, and every one of the words below is banned in rendered copy by
     * C3 or C6. Shown as prose on a researcher's screen they would be defects;
     * shown as a quoted input they are the record of what the tool asked. */
    const { MATRIX } = await import("../src/matrix/matrix.ts");
    const modelFacing = MATRIX.filter((c) =>
      /\b(?:chunk|chunks|ontology|retrieval|residue|corpus)\b/i.test(c.prompt),
    ).length;
    expect(modelFacing).toBeGreaterThan(5);
    // And the imperative register: a prompt tells the model what to do, which is
    // not a sentence any surface may print at a researcher unmarked.
    expect(MATRIX.filter((c) => /\bDo not\b|\bAsk\b|\bState\b/.test(c.prompt)).length).toBeGreaterThan(
      10,
    );
    // The dashes are gone, and a future pass that puts one back has to say why.
    expect(MATRIX.filter((c) => /[—–]/.test(c.prompt))).toEqual([]);
  });
});

/**
 * The four occurrences the survey found on screen.
 *
 * Only the /coherence one survived verbatim in the report, unspaced so it read
 * as a typo on top of breaking the rule. The other three reproduce the shapes
 * reported for the /design/tension finding and the two /ontology draft bodies,
 * which are runtime model output and live in the fixture study's IndexedDB
 * rather than in the repo. They are kept as whole sentences rather than
 * fragments because the gate decides per sentence, so a fragment would test a
 * different code path than the one that shipped the defect.
 */
const ON_SCREEN = {
  coherence:
    "The claim rests on extensive fieldwork—dozens of interviews—but every one of them is with a founder who stayed.",
  tension:
    "Your site and your question pull in opposite directions — the question is about how a practice spreads, and the site is a single team.",
  ontologyBodyOne:
    "Coordination holds because the handoff is rehearsed — it is not the protocol doing the work, and the protocol is what the incumbent account credits.",
  ontologyBodyTwo:
    "Every piece of material the corpus offered was absorbed by the existing account — the signature of a framework digesting the field rather than being changed by it.",
} as const;

describe("the voice gate on model output (FND-01)", () => {
  test("the four occurrences the survey found on screen come out clean", () => {
    for (const [surface, text] of Object.entries(ON_SCREEN)) {
      expect(containsBannedDash(text)).toBe(true); // the fixture is real
      const out = normaliseModelProse(text);
      expect({ surface, dashed: containsBannedDash(out) }).toEqual({ surface, dashed: false });
    }
  });

  test("dashes are rewritten, never deleted", () => {
    // Deleting is the obvious fix and the wrong one: it produces
    // "fieldworkdozens". Every rewrite has to leave a word boundary standing.
    expect(normaliseModelProse(ON_SCREEN.coherence)).toBe(
      "The claim rests on extensive fieldwork, dozens of interviews, but every one of them is with a founder who stayed.",
    );
    expect(normaliseModelProse("a—b")).toBe("a, b");
    expect(normaliseModelProse("a—b")).not.toContain("ab");
  });

  test("a clause join becomes a full stop when what follows stands alone", () => {
    expect(normaliseModelProse(ON_SCREEN.ontologyBodyOne)).toBe(
      "Coordination holds because the handoff is rehearsed. It is not the protocol doing the work, and the protocol is what the incumbent account credits.",
    );
  });

  test("an appositive becomes a comma", () => {
    expect(normaliseModelProse(ON_SCREEN.ontologyBodyTwo)).toBe(
      "Every piece of material the corpus offered was absorbed by the existing account, the signature of a framework digesting the field rather than being changed by it.",
    );
    expect(normaliseModelProse(ON_SCREEN.tension)).toBe(
      "Your site and your question pull in opposite directions, the question is about how a practice spreads, and the site is a single team.",
    );
  });

  test("a dash after a label or a copula becomes a colon", () => {
    // Load-bearing rather than stylistic. parseVerdict in src/lint/semantic.ts
    // strips a leading run of whitespace, colons and dashes off the reason it
    // reads from the model's first line. A comma is not in that class, so
    // choosing one here would have shipped every coherence finding with a
    // leading comma in its reason.
    expect(normaliseModelProse("CONCERN — the sample was chosen on the outcome.")).toBe(
      "CONCERN: the sample was chosen on the outcome.",
    );
    expect(normaliseModelProse("The trouble is — the sample was chosen on the outcome.")).toBe(
      "The trouble is: the sample was chosen on the outcome.",
    );
  });

  test("a range becomes 'to', spaced or not", () => {
    expect(normaliseModelProse("Fieldwork ran 2019–2021 across both wards.")).toBe(
      "Fieldwork ran 2019 to 2021 across both wards.",
    );
    expect(normaliseModelProse("Observation ran March – June 2024.")).toBe(
      "Observation ran March to June 2024.",
    );
    expect(normaliseModelProse("Interviews 12–15 are with the same informant.")).toBe(
      "Interviews 12 to 15 are with the same informant.",
    );
  });

  test("a paired aside becomes a pair of commas, never a split sentence", () => {
    // Choosing a full stop for the opening dash of a pair would leave the
    // aside stranded as a fragment, which is worse than the defect.
    expect(
      normaliseModelProse("The design — as you have stated it — bounds the answer."),
    ).toBe("The design, as you have stated it, bounds the answer.");
  });

  test("a leading dash is a bullet and stays one", () => {
    expect(normaliseModelProse("— the sample is small\n— the sites are alike\n")).toBe(
      "- the sample is small\n- the sites are alike\n",
    );
  });

  test("punctuation is never stacked", () => {
    expect(normaliseModelProse("She stopped there —")).toBe("She stopped there.");
    expect(normaliseModelProse("First, — then the rest.")).toBe("First, then the rest.");
  });

  test("JSON-shaped model output stays parseable", () => {
    // extract.ts and glean.ts parse the model's JSON. A rewrite that escaped a
    // string value would take the proposals tray down rather than clean it up.
    const raw = '{"title":"Boundary work—at the edge","body":"Two things — the site and the sample."}';
    const parsed = JSON.parse(normaliseModelProse(raw)) as { title: string; body: string };
    expect(containsBannedDash(parsed.title)).toBe(false);
    expect(containsBannedDash(parsed.body)).toBe(false);
  });

  test("text with no dash is returned byte-identical, and the gate is idempotent", () => {
    const clean = "My sense is the comparison cannot support the claim you want from it.";
    expect(normaliseModelProse(clean)).toBe(clean);
    for (const text of Object.values(ON_SCREEN)) {
      const once = normaliseModelProse(text);
      expect(normaliseModelProse(once)).toBe(once);
    }
  });

  test("Anti: the gate is not a no-op dressed as a pass", () => {
    // Every assertion above would still pass if normaliseModelProse returned
    // its input and the fixtures happened to be clean, so the fixtures are
    // checked for the character they exist to carry.
    for (const text of Object.values(ON_SCREEN)) {
      expect(containsBannedDash(text)).toBe(true);
      expect(normaliseModelProse(text)).not.toBe(text);
    }
  });
});

describe("the voice gate keeps provenance exact", () => {
  test("the pre-normalised string rides back on the result", () => {
    const gated = applyVoiceGate({
      text: ON_SCREEN.coherence,
      model: "claude-sonnet-4-6",
      modelVersion: "claude-sonnet-4-6-20260101",
    });
    expect(gated.rawText).toBe(ON_SCREEN.coherence);
    expect(containsBannedDash(gated.text)).toBe(false);
    expect(gated.model).toBe("claude-sonnet-4-6");
    expect(gated.modelVersion).toBe("claude-sonnet-4-6-20260101");
  });

  test("a clean response carries no second copy of itself", () => {
    const clean = "My sense is the comparison cannot support the claim.";
    const gated = applyVoiceGate({ text: clean, model: "m", modelVersion: "v" });
    expect(gated.rawText).toBeUndefined();
    expect(voiceGateProvenance(gated)).toEqual({});
  });

  test("crossing the gate twice keeps the first raw string, not the second", () => {
    // The bridge gates a streamed answer and then gates the final envelope.
    // If the second pass overwrote rawText the ledger would record the gate's
    // own output as what the model said, which is the exact claim the ledger
    // must never make falsely.
    const once = applyVoiceGate({
      text: ON_SCREEN.tension,
      model: "m",
      modelVersion: "v",
    });
    const twice = applyVoiceGate(once);
    expect(twice.rawText).toBe(ON_SCREEN.tension);
    expect(twice.text).toBe(once.text);
  });

  test("the provenance bag validates as a ledger event", () => {
    // Additive rather than a new event type: the raw string is a property of a
    // response that already gets recorded. This asserts the field survives the
    // schema, so an event author can spread it in without a ledger change.
    const gated = applyVoiceGate({
      text: ON_SCREEN.ontologyBodyOne,
      model: "claude-sonnet-4-6",
      modelVersion: "claude-sonnet-4-6-20260101",
    });
    const event = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      actor: "persona:eisenhardt-positivist",
      projectId: "proj-test",
      model: gated.model,
      modelVersion: gated.modelVersion,
      type: "response",
      text: gated.text,
      ...voiceGateProvenance(gated),
    };
    expect(validateEvent(event)).toEqual([]);
    expect((event as { rawText?: string }).rawText).toBe(ON_SCREEN.ontologyBodyOne);
  });
});

/** Minimal Anthropic Messages API response for an injected fetch. */
function anthropicFetch(text: string): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ model: "claude-sonnet-4-6-20260101", content: [{ type: "text", text }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

/** Minimal CLI bridge /complete response for an injected fetch. */
function bridgeFetch(text: string): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ text, model: "sonnet", modelVersion: "sonnet-2026" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

const REQ: CompleteRequest = { system: "s", messages: [{ role: "user", content: "m" }] };

describe("the voice gate is wired into every client", () => {
  /**
   * lintSemantic shipped orphaned once: written, tested in isolation and never
   * called. A normaliser that only one of three clients uses would fail the
   * same way and look exactly as green, because each client has its own tests
   * and none of them would notice. So the wiring is asserted twice: by
   * behaviour, which is what actually matters, and by import, which catches a
   * client that grows a second return path around the gate.
   */
  const CLIENT_FILES = ["anthropic.ts", "cliBridge.ts", "mock.ts"];

  test.each(CLIENT_FILES)("%s imports the gate", async (file) => {
    const src = await Bun.file(new URL(`../src/inference/${file}`, import.meta.url)).text();
    expect(src).toContain('from "./voiceGate.ts"');
    expect(src).toContain("applyVoiceGate");
  });

  test("MockInferenceClient gates its scripted responses", async () => {
    const client = new MockInferenceClient({ responses: [ON_SCREEN.ontologyBodyTwo] });
    const result = await client.complete(REQ);
    expect(containsBannedDash(result.text)).toBe(false);
    expect(result.rawText).toBe(ON_SCREEN.ontologyBodyTwo);
  });

  test("AnthropicInferenceClient gates what the API returns", async () => {
    const client = new AnthropicInferenceClient({
      getToken: () => "sk-" + "ant-api03-test",
      fetchImpl: anthropicFetch(ON_SCREEN.coherence),
    });
    const result = await client.complete(REQ);
    expect(containsBannedDash(result.text)).toBe(false);
    expect(result.rawText).toBe(ON_SCREEN.coherence);
    expect(result.modelVersion).toBe("claude-sonnet-4-6-20260101");
  });

  test("CliBridgeInferenceClient gates what the bridge returns", async () => {
    const client = new CliBridgeInferenceClient({ fetchImpl: bridgeFetch(ON_SCREEN.tension) });
    const result = await client.complete(REQ);
    expect(containsBannedDash(result.text)).toBe(false);
    expect(result.rawText).toBe(ON_SCREEN.tension);
  });

  test("the bridge gates the stream too, not only the final envelope", async () => {
    // Gating only the envelope would paint the dash while the answer streams
    // and then swap it out under the researcher, which is worse than either
    // state on its own.
    const frames = [
      'event: delta\ndata: {"text":"Coordination holds because the handoff is rehearsed "}\n\n',
      'event: delta\ndata: {"text":"\\u2014 it is not the "}\n\n',
      'event: delta\ndata: {"text":"protocol doing the work."}\n\n',
      `event: final\ndata: ${JSON.stringify({ text: "Coordination holds because the handoff is rehearsed — it is not the protocol doing the work.", model: "sonnet" })}\n\n`,
    ];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        for (const f of frames) controller.enqueue(enc.encode(f));
        controller.close();
      },
    });
    const client = new CliBridgeInferenceClient({
      fetchImpl: (async () => new Response(body, { status: 200 })) as unknown as typeof fetch,
    });

    let painted = "";
    const result = await client.completeStream(REQ, (d) => {
      painted += d.text;
      // Checked on every delta, not only at the end: the defect was a
      // character that appeared and then vanished.
      expect(containsBannedDash(painted)).toBe(false);
    });

    expect(containsBannedDash(result.text)).toBe(false);
    expect(painted).toBe(result.text);
    expect(result.rawText).toContain("—");
  });

  test("the stream gate never duplicates the sentence it held back", async () => {
    // The first version cut the held-back region at the whole sentence and
    // re-sent it once the dash resolved, printing the sentence twice.
    const source =
      "The comparison cannot support the claim — it is justified by difference. Then a clean sentence follows.";
    for (const size of [1, 3, 7, 40]) {
      let painted = "";
      const gate = createStreamVoiceGate((d) => {
        painted += d.text;
      });
      for (let i = 0; i < source.length; i += size) gate.push(source.slice(i, i + size));
      const final = gate.finish();
      expect(painted).toBe(final);
      expect(containsBannedDash(final)).toBe(false);
      expect(gate.raw()).toBe(source);
    }
  });
});

/**
 * The read half of the same rule (FND-01).
 *
 * The gate at the inference boundary covers everything written after it and
 * nothing written before, and the bar is a grep of the rendered DOM. A survey
 * of the running fixture study found five occurrences the gate could not have
 * touched: two proposal bodies in the ontology tray, a finding on
 * /design/tension, a finding on /coherence, and three interview questions whose
 * dashes had already been removed from `src/interview/moves.ts` but were still
 * in the ledger from the turn on which they were asked.
 */
describe("rows written before the gate existed (FND-01)", () => {
  const base = {
    id: "e-1",
    ts: 1,
    actor: "persona:eisenhardt-positivist",
    projectId: "p-1",
  } as const;

  test("a stored proposal body comes out of the read boundary clean", () => {
    const stored = {
      ...base,
      type: "proposal",
      proposalId: "pr-1",
      title: "Handoff as rehearsal — not transfer",
      body: ON_SCREEN.ontologyBodyOne,
      sourceChunks: ["c1"],
    } as unknown as LedgerEvent;
    const [out] = normaliseLedgerProse([stored]) as unknown as readonly Record<string, string>[];
    expect(containsBannedDash(out?.title ?? "")).toBe(false);
    expect(containsBannedDash(out?.body ?? "")).toBe(false);
    // Rewritten, not deleted, and it is the same rewrite the write half makes.
    expect(out?.body).toBe(normaliseModelProse(ON_SCREEN.ontologyBodyOne));
  });

  test("a stored question and a stored finding come out clean", () => {
    const events = [
      {
        ...base,
        id: "e-2",
        type: "question-selection",
        moveId: "m1",
        topic: "page:pz",
        question: "This puzzle has no observation attached — what did you see?",
        alternatives: ["Nothing competes with this — what would?"],
        mode: "interrogation",
        reason: "selected because the puzzle is unanchored — nothing cites it",
        station: "context",
      },
      {
        ...base,
        id: "e-3",
        type: "lint-finding",
        rule: "evidence-thin",
        targetKind: "design",
        targetId: "",
        reason: ON_SCREEN.coherence,
        pass: "run-1",
      },
    ] as unknown as readonly LedgerEvent[];
    const out = normaliseLedgerProse(events) as unknown as readonly Record<string, unknown>[];
    /*
     * Field by field rather than over the stringified row, and the change is a
     * restatement rather than a relaxation.
     *
     * The property this protects is that nothing the reader or an export sees
     * carries a banned dash, and it still asserts exactly that. What it can no
     * longer do is grep the whole JSON, because the normaliser now keeps what
     * the model wrote on `asWritten` and that field exists to hold the
     * character. Greping the row would therefore have made the provenance bag
     * indistinguishable from the defect. Both halves are checked below: every
     * prose field is clean, and the original is still recoverable.
     */
    const prose = out.map((row) => {
      const { asWritten: _kept, ...rest } = row;
      return rest;
    });
    expect(JSON.stringify(prose).match(/[—–]/g) ?? []).toEqual([]);
    // The alternatives array is prose too, and it is rendered beside the
    // question as the moves not taken.
    expect(Array.isArray(out[0]?.alternatives)).toBe(true);
    // Nothing was lost to make that true.
    const kept = out[0]?.asWritten as Record<string, unknown> | undefined;
    expect(kept?.question).toBe(
      "This puzzle has no observation attached — what did you see?",
    );
    expect(restoreAsWritten(out[0] as unknown as LedgerEvent)).toEqual(
      events[0] as LedgerEvent,
    );
  });

  test("the researcher's own words are never rewritten", () => {
    // The one thing worse than the defect. A response, a refusal note, a flag
    // reason and a finding disposition are the researcher speaking into a box,
    // and the tool does not correct the punctuation of the person it is
    // interviewing.
    const mine = [
      { ...base, id: "r-1", type: "response", text: "I think it is rehearsal — not transfer." },
      { ...base, id: "r-2", type: "refusal", topic: "page:pz", note: "Not now — ask me later." },
    ] as unknown as readonly LedgerEvent[];
    expect(normaliseLedgerProse(mine)).toBe(mine);
    for (const field of ["response", "refusal", "flag", "finding-disposition"] as const) {
      expect(modelAuthoredFields(field)).toEqual([]);
    }
  });

  test("an ontology-mutation body is model prose, whatever its origin says", () => {
    /*
     * The inverse of the case above, and it is the line that moved.
     *
     * This used to sit inside "the researcher's own words are never rewritten",
     * asserting `modelAuthoredFields("ontology-mutation")` was empty, on the
     * premise that a page stamped `author-prior` holds prose the researcher
     * typed. The premise was measured and it is false: no path in `src/` creates
     * a page body from researcher-typed prose, `op: "create"` is written in three
     * places that all draft from a model, there is no writer for `op: "revise"`
     * at all, and the fixture's `author-prior` page has a body byte-identical to
     * a drafter proposal in the same ledger. The consequence was two banned
     * dashes in every exported `ledger.json` and `bundle.json`.
     *
     * So the property is restated rather than dropped, and the half that
     * actually protected the researcher is the test above. What guards against
     * over-reach here is `asWritten`: nothing is lost, so if a real
     * researcher-authored page path is ever built, this is reversible.
     */
    const drafted = {
      ...base,
      id: "r-3",
      type: "ontology-mutation",
      op: "create",
      pageType: "puzzle",
      targetId: "pg-1",
      origin: "author-prior",
      title: "Rehearsal — my words",
      body: ON_SCREEN.ontologyBodyOne,
    } as unknown as LedgerEvent;
    const [out] = normaliseLedgerProse([drafted]) as unknown as readonly Record<string, unknown>[];
    expect(containsBannedDash(String(out?.title))).toBe(false);
    expect(containsBannedDash(String(out?.body))).toBe(false);
    expect(modelAuthoredFields("ontology-mutation")).toEqual(["title", "body"]);
    // And the record still says what was drafted.
    expect(restoreAsWritten(out as unknown as LedgerEvent)).toEqual(drafted);
  });

  test("a clean ledger is returned by identity, not rebuilt", () => {
    // The provider feeds this straight into React state on every append, so a
    // fresh array every read would invalidate every memo keyed on it.
    const clean = [
      { ...base, type: "proposal", proposalId: "pr-2", title: "Rehearsal, not transfer", body: "Clean.", sourceChunks: [] },
    ] as unknown as readonly LedgerEvent[];
    expect(normaliseLedgerProse(clean)).toBe(clean);
  });
});

describe("the document title (ISC-177)", () => {
  test("index.html carries no banned dash", async () => {
    // `<title>Abductive — Qualitative Design Tool</title>` rendered on all eleven
    // routes and was the single largest source of banned punctuation in the
    // shipped DOM. The prose scan globs `src/`, and index.html is not in src/.
    const html = await Bun.file(new URL("../index.html", import.meta.url)).text();
    expect(/[—–]/.test(html)).toBe(false);
    expect(html).toContain("<title>");
  });
});

/**
 * The write half of the same rule, at the boundary the DOM grep cannot see
 * (FND-01).
 *
 * The survey hooked URL.createObjectURL on the Exports tab and captured the
 * blobs: memo.md carried 10 banned dashes, session-replay.md 12, the agent
 * graph 2. A grep of the rendered DOM on ten routes had come back with zero at
 * the same moment, because the offenders were in the export writers' own
 * template strings ("# Session replay — ...", "## Response — human") and those
 * strings never reach a screen. Files a researcher hands to a co-author are
 * user-facing prose whether or not the app ever paints them.
 *
 * The source scan above now covers src/export, which is what stops that
 * regressing in the writers. This builds the three markdown exports from a
 * ledger with no dash anywhere in it, so anything the assertion finds was put
 * there by the tool rather than by the study.
 */
describe("what the exports write (FND-01)", () => {
  const projectId = "proj-prose";
  let clock = 2_300_000_000_000;
  const env = (actor: string) => {
    clock += 1000;
    return { id: crypto.randomUUID(), ts: clock, actor, projectId };
  };

  const events = [
    {
      ...env("human"),
      type: "ontology-mutation",
      op: "create",
      targetId: "pg-puzzle",
      pageType: "puzzle",
      title: "Handoff labels move with nobody deciding",
      body: "The label changes across a shift and no decision point is visible.",
      origin: "author-prior",
      supportingChunks: ["c1"],
    },
    {
      ...env("human"),
      type: "ontology-mutation",
      op: "create",
      targetId: "pg-theory",
      pageType: "theory",
      title: "Handoff as information transfer",
      body: "The incumbent account credits the protocol.",
      origin: "author-prior",
      supportingChunks: [],
    },
    {
      ...env("persona:eisenhardt-positivist"),
      type: "challenge",
      text: "Two sites is not a comparison unless they differ on the thing you claim matters.",
      matrixCell: "site:instrument",
    },
    { ...env("human"), type: "response", text: "They differ on staffing, which is the claim." },
    {
      ...env("human"),
      type: "ontology-mutation",
      op: "relate",
      targetId: "pg-puzzle->pg-theory",
      edge: { from: "pg-puzzle", to: "pg-theory", role: "anomalous-for" },
      puzzleRelation: "contradicts",
      origin: "author-prior",
      supportingChunks: [],
    },
  ] as unknown as readonly LedgerEvent[];

  const project = {
    id: projectId,
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
  } as unknown as Parameters<typeof buildSessionReplay>[0]["project"];

  const graph = projectOntology(events, projectId);

  test("the fixture ledger is clean, so anything found is the tool's own voice", () => {
    // Vacuity guard in reverse: if the study's own words carried a dash, a
    // failure below would say nothing about the writers.
    expect(containsBannedDash(JSON.stringify(events))).toBe(false);
    expect(containsBannedDash(JSON.stringify(project))).toBe(false);
  });

  test("the memo carries no banned dash", () => {
    const memo = buildOntologyMemo({ project, graph, events });
    expect(memo.length).toBeGreaterThan(200);
    expect(memo.match(/[—–]/g) ?? []).toEqual([]);
  });

  test("the session replay carries no banned dash", () => {
    const replay = buildSessionReplay({ project, events });
    expect(replay).toContain("# Session replay");
    expect(replay.match(/[—–]/g) ?? []).toEqual([]);
  });

  test("every file in the wiki directory carries no banned dash", () => {
    const files = buildWikiFiles({ project, graph, events });
    expect(files.length).toBeGreaterThan(3);
    const offenders = files
      .filter((f) => /[—–]/.test(f.content))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  test("the obligation details the exports quote carry no banned dash", () => {
    // src/ontology was the directory the scan did not cover, and relations.ts
    // is why it mattered: its detail strings are written into the memo's debt
    // section and into index.md, so a dash there reaches disk by two routes
    // without ever reaching a screen.
    const details = checkAllObligations(graph)
      .map((o) => o.detail)
      .join(" ");
    expect(details.length).toBeGreaterThan(0);
    expect(containsBannedDash(details)).toBe(false);
  });
});

/**
 * Every artefact a download produces, from a ledger that is dirty on purpose
 * (FND-01, the scope hole).
 *
 * The block above is a good test of the writers' own template strings and it
 * has two properties that made it structurally unable to see what shipped.
 *
 * Its fixture is clean, by design and with a guard that says so, so it can only
 * find a dash the writer itself wrote. And it imports three of the seven
 * writers. `ledgerJson.ts`, `bundle.ts` and `agentGraph.ts` were never
 * imported by any prose test, and `ExportBar` did not even call the first of
 * them: it stringified the event array inline. So the two files that carry the
 * record went out with twelve banned dashes each while 1079 tests passed, the
 * rendered DOM measured zero on ten routes, and `tsc --noEmit` exited 0. The
 * critic found it by hooking `URL.createObjectURL` on the running app, which is
 * the only place the artefacts existed.
 *
 * This closes both holes at once. All seven blobs, built the way `ExportBar`
 * builds them, from a ledger whose model-authored fields carry the character
 * the fixture study's really did. Two assertions on each, and both are needed:
 *
 *  - Zero literal banned characters in the bytes. That is the house rule, and
 *    the bytes are the only form a reviewer ever holds. The two record files
 *    are held to it without qualification; the readings are held to it on
 *    everything except a verbatim quotation of the researcher, which is argued
 *    at the test rather than assumed here.
 *  - For the readings, zero in the parsed value too. A reading has no business
 *    encoding anything, so if one of them ever needs the escape that is a
 *    normalisation defect and it should fail here rather than be hidden. The
 *    two record files are the exception, and their own test in
 *    `export-voice.test.ts` proves the escape decodes to the original.
 *
 * The list of seven is written out rather than globbed, because the point of a
 * scope hole is that the thing missing is the thing nobody enumerated.
 */
describe("what a download actually contains (FND-01, all seven)", () => {
  const projectId = "proj-dirty";
  let tick = 2_500_000_000_000;
  const env = (actor: string) => {
    tick += 1000;
    return { id: crypto.randomUUID(), ts: tick, actor, projectId };
  };

  /*
   * The three sentences are the ones measured in the shipped `ledger.json`,
   * character for character, so this fails for the reason the app failed.
   * A page body drafted by a model and accepted; an interview question the tool
   * wrote itself, whose source in `moves.ts` already reads as a full stop; and
   * a lint reason with the dash unspaced inside a word.
   */
  const DIRTY_BODY =
    "They would say I've made this sound like a communication problem, and it isn't — that's the misunderstanding I'm being told I have.";
  const DIRTY_QUESTION =
    "This puzzle has no observation attached — what did you actually see that it refers to?";
  const DIRTY_REASON =
    "Qualitative work at this venue typically rests on extensive fieldwork—dozens of interviews.";

  const stored = [
    {
      ...env("human"),
      type: "ontology-mutation",
      op: "create",
      targetId: "pg-puzzle",
      pageType: "puzzle",
      title: "Communication-problem framing may be watching the wrong object",
      body: DIRTY_BODY,
      origin: "model-proposed",
      supportingChunks: [],
    },
    {
      ...env("human"),
      type: "ontology-mutation",
      op: "create",
      targetId: "pg-theory",
      pageType: "theory",
      title: "Handoff as information transfer",
      body: "The incumbent account credits the protocol.",
      origin: "author-prior",
      supportingChunks: [],
    },
    {
      ...env("persona:drafter"),
      type: "proposal",
      proposalId: "pr-1",
      title: "Handoff as rehearsal, not transfer",
      body: DIRTY_BODY,
      sourceChunks: [],
    },
    {
      ...env("persona:interviewer"),
      type: "question-selection",
      moveId: "m1",
      topic: "page:pg-puzzle",
      question: DIRTY_QUESTION,
      alternatives: ["What competes with this account?"],
      mode: "interrogation",
      reason: "The puzzle is unanchored.",
      station: "context",
    },
    // The researcher's own words, and they are never rewritten by anything in
    // this codebase. Included with the character in them on purpose: the file
    // still has to come out clean, and the only treatment that achieves that
    // without editing a human being is the encoding.
    {
      ...env("human"),
      type: "response",
      text: "The two nurses agreed about the handoff itself — the content went over cleanly.",
    },
    {
      ...env("persona:eisenhardt-positivist"),
      type: "lint-finding",
      rule: "evidence-thin",
      targetKind: "design",
      targetId: "",
      reason: DIRTY_REASON,
      pass: "run-1",
    },
  ] as unknown as readonly LedgerEvent[];

  const project = {
    id: projectId,
    title: "Handoffs on the night ward",
    createdAt: tick,
    brief: {
      researchQuestion: "How do patient stories change across the night shift handoff?",
      context: "An acute ward.",
      site: "One hospital.",
      process: "The handover.",
      outcome: "",
      dataType: "ethnographic",
      targetVenue: "A top management journal",
    },
  } as unknown as Parameters<typeof buildSessionReplay>[0]["project"];

  // Exactly what `LedgerProvider` hands `ExportBar`, and then exactly what
  // `StudyExports` hands it as a graph. Nothing here is a shortcut around the
  // app's own pipeline; the wiring itself is asserted in export-voice.test.ts.
  const events = normaliseLedgerProse(stored);
  const graph = voicedGraph(projectOntology(events, projectId));

  const readings = () => [
    { name: "memo.md", text: buildOntologyMemo({ project, graph, events }) },
    { name: "ontology.svg", text: buildDiagramSvg(graph, { title: project.title }) },
    {
      name: "ontology.json",
      text: serializeAgentGraph(
        buildAgentGraph({ project, graph, events, chunks: [] }),
      ),
    },
    { name: "replay.md", text: buildSessionReplay({ project, events }) },
    {
      name: "export-receipt.md",
      text: buildExportReceipt({
        title: project.title,
        stamp: "abcd1234",
        events: events.length,
        taken: [{ at: tick, name: "study-memo.md", bytes: 4490, stamp: "abcd1234", events: 6 }],
        at: tick,
      }),
    },
    ...buildWikiFiles({ project, graph, events }).map((f) => ({
      name: `wiki/${f.path}`,
      text: f.content,
    })),
  ];

  const records = () => [
    { name: "ledger.json", text: serializeLedgerExport(buildLedgerExport(projectId, events)) },
    {
      name: "bundle.json",
      text: serializeBundle(
        buildBundle({
          project: project as unknown as Parameters<typeof buildBundle>[0]["project"],
          documents: [],
          chunks: [],
          anomalies: [],
          twin: null,
          events,
        }),
      ),
    },
  ];

  test("the fixture really is dirty, in the fields the shipped one was", () => {
    // Vacuity guard, and the inverse of the one in the block above. Everything
    // below is meaningless unless the stored ledger carries the character.
    expect((JSON.stringify(stored).match(/[—–]/g) ?? []).length).toBeGreaterThanOrEqual(4);
    // And the reading really does keep it, which is what the escape is for.
    expect(containsBannedDash(JSON.stringify(events))).toBe(true);
  });

  /**
   * Every string in the ledger the tool did not write.
   *
   * The complement of `modelAuthoredFields`, read off the same table so the two
   * cannot drift: a field the normaliser will not touch is a field the
   * researcher typed. `asWritten` and `rawText` are excluded because they are
   * the opposite thing, a verbatim copy of what a model produced, kept for the
   * audit.
   *
   * Longest first, so stripping a long quotation cannot be pre-empted by a
   * short string that happens to be a substring of it.
   */
  const researcherStrings = (): readonly string[] => {
    const out: string[] = [];
    for (const e of events) {
      const model = new Set(modelAuthoredFields(e.type));
      for (const [key, value] of Object.entries(e as unknown as Record<string, unknown>)) {
        if (key === "asWritten" || key === "rawText") continue;
        if (model.has(key)) continue;
        if (typeof value === "string" && value.length > 8) out.push(value);
      }
    }
    return out.sort((a, b) => b.length - a.length);
  };

  const withoutQuotations = (text: string): string =>
    researcherStrings().reduce((acc, quote) => acc.split(quote).join(""), text);

  test("nothing the tool wrote carries a banned dash, in any of the seven", () => {
    /*
     * The one boundary in this check, and it is the codebase's own rather than
     * one invented to make a test pass.
     *
     * `displayProse.ts` draws it already: the tool's voice is normalised
     * everywhere, and the researcher's words are never rewritten, "not even to
     * satisfy the tool's own house style". That is not a softening of the house
     * rule, it is the only reading of it that does not require the tool to
     * misquote the person it is interviewing. A memo, a replay and a wiki page
     * quote researcher responses verbatim inside blockquotes; editing the
     * punctuation of a quotation is a worse defect than the one it fixes, and
     * markdown has no escape to hide behind the way JSON does.
     *
     * So the assertion strips every verbatim researcher quotation out of the
     * artefact and holds what is left, which is the tool's own composition, to
     * zero. The fixture's researcher response carries the character on purpose
     * so this boundary is exercised rather than assumed, and the guard below
     * proves the strip removed a real quotation rather than nothing.
     */
    const offenders = [...readings(), ...records()]
      .filter((f) => /[—–]/.test(withoutQuotations(f.text)))
      .map((f) => f.name);
    expect(offenders).toEqual([]);
  });

  test("the two record files carry no banned dash at all, quotation or not", () => {
    // No boundary here, because JSON has an escape and the record exports use
    // it. These two are held to the letter of the rule on the raw bytes,
    // including the researcher's own sentence and the model's kept original.
    const offenders = records()
      .filter((f) => /[—–]/.test(f.text))
      .map((f) => f.name);
    expect(offenders).toEqual([]);
  });

  test("Anti: the strip removes a real quotation, and would not hide the tool's own", () => {
    // Two vacuity guards on the boundary above. The researcher's sentence must
    // really be in the replay and really be removed; and a dash the tool wrote
    // must survive the strip, or the check is a no-op dressed as a pass.
    const replay = readings().find((f) => f.name === "replay.md")?.text ?? "";
    expect(/[—–]/.test(replay)).toBe(true);
    expect(/[—–]/.test(withoutQuotations(replay))).toBe(false);
    expect(withoutQuotations("## Response — human\n").trim()).toBe("## Response — human");
  });

  test("every artefact has content, so no name above is passing on an empty string", () => {
    for (const f of [...readings(), ...records()]) expect(f.text.length).toBeGreaterThan(100);
    // Seven downloads, and the wiki is a directory of five files.
    expect(readings()).toHaveLength(10);
    expect(records()).toHaveLength(2);
  });

  test("the five readings are clean without needing the escape", () => {
    /* The concealment check, and it is the reason the assertion above is not
     * enough on its own. `serializeRecord` would turn a genuine regression in a
     * tool-authored sentence into a passing grep, so the escape is confined to
     * the two files that hold the record and every other writer has to be clean
     * on the value rather than on the bytes. A markdown or SVG artefact has no
     * escape at all, so for those two the check is the same string twice; for
     * `ontology.json` it is the parsed value, which is where a hidden dash
     * would be. */
    for (const f of readings()) {
      const value = f.name.endsWith(".json") ? JSON.stringify(JSON.parse(f.text)) : f.text;
      expect({ name: f.name, dashes: withoutQuotations(value).match(/[—–]/g) ?? [] }).toEqual({
        name: f.name,
        dashes: [],
      });
    }
  });

  test("the two record files decode back to what the model actually wrote", () => {
    // The other half of the same argument. Clean bytes must not have cost the
    // record: the sentence the model produced is still recoverable from each
    // file, dash included.
    for (const f of records()) {
      expect(JSON.stringify(JSON.parse(f.text))).toContain(DIRTY_BODY);
    }
  });
});

/**
 * A comment that names a file names a file that exists.
 *
 * This codebase explains itself in prose more than most, on purpose: every
 * comment names the defect that motivated the code under it, and a good number
 * of them point at the module that owns the rule. That is worth having and it
 * rots the moment a module is renamed. Round nine renamed one — `originMark.ts`
 * became `components/PageMark.tsx` — and left seven comments across five source
 * files and two stylesheets pointing at a path that no longer existed, each one
 * telling the next reader to go and look at nothing.
 *
 * Nothing in 899 tests said a word, because a comment is not code. It is
 * checkable all the same: a path is a path.
 */
describe("no comment points at a file that is not there", () => {
  const PATH = /\bsrc\/[A-Za-z0-9_/-]+\.(?:ts|tsx|css|md)\b/g;

  test("every src path named in a comment or a stylesheet resolves", async () => {
    const root = new URL("../src/", import.meta.url).pathname;
    const present = new Set<string>();
    for await (const rel of new Glob("**/*.{ts,tsx,css}").scan(root)) present.add(`src/${rel}`);
    expect(present.size).toBeGreaterThan(60);

    const dead: string[] = [];
    for await (const rel of new Glob("**/*.{ts,tsx,css}").scan(root)) {
      const text = await Bun.file(`${root}${rel}`).text();
      for (const m of text.matchAll(PATH)) {
        const named = m[0];
        if (!present.has(named)) dead.push(`src/${rel}: ${named}`);
      }
    }
    expect([...new Set(dead)].sort()).toEqual([]);
  });

  test("Anti: the reader finds real paths, and would notice a dead one", async () => {
    // Vacuity guard. If the regex stops matching, the check above passes on an
    // empty set and the rot it exists for goes back to being invisible.
    const root = new URL("../src/", import.meta.url).pathname;
    let found = 0;
    for await (const rel of new Glob("**/*.{ts,tsx,css}").scan(root)) {
      const text = await Bun.file(`${root}${rel}`).text();
      found += [...text.matchAll(PATH)].length;
    }
    expect(found).toBeGreaterThan(20);
    expect([..."/* see src/ui/originMark.ts */".matchAll(PATH)].map((m) => m[0])).toEqual([
      "src/ui/originMark.ts",
    ]);
  });
});

/**
 * The copy standard reaches the model (M42, docs/copy-standard.md part 4).
 *
 * Most of what a researcher reads is written by the model rather than by a string
 * in this repo, so the mechanical half of the standard is stated for the model in
 * one place, `MODEL_VOICE_RULES` in `src/inference/promptMarkers.ts`, and every
 * prompt carries it. Two ways of asserting that, for the reason the voice gate is
 * asserted two ways above: the contracts are checked by value, and every builder
 * that hands a `system` prompt to a client is checked by source, which is what
 * catches a sixth prompt builder arriving without the block.
 *
 * The rules are the machine-checkable ones only. What a prompt asks for, and how
 * it tells the model to judge, is the prompt's own and stays as built: rewording
 * an instruction to a model is a methodological change, which is why the copy
 * bar's scope list leaves prompt text out.
 */
describe("every prompt carries the copy standard for the model (M42)", () => {
  test("the three shared contracts state the rules once, by including the block", async () => {
    const { MODEL_VOICE_RULES } = await import("../src/inference/promptMarkers.ts");
    const { PROSE_CONTRACT, VOICE_CONTRACT, INTERVIEW_CONTRACT } = await import(
      "../src/personas/voice.ts"
    );
    /* The block itself says the things a machine can check. M48 added the two
     * the owner's report of 2026-09-13 was about: the scope of the naming rule
     * (a pronoun's noun has to be in its own sentence, not the one before) and
     * the place words, which the M42 block never named at all. */
    for (const rule of [
      "you",
      "contractions",
      "em dashes",
      "one-word sentences",
      "earlier in the same sentence",
      "Name the place",
    ]) {
      expect({ rule, said: MODEL_VOICE_RULES.includes(rule) }).toEqual({ rule, said: true });
    }
    for (const [name, contract] of [
      ["PROSE_CONTRACT", PROSE_CONTRACT],
      ["VOICE_CONTRACT", VOICE_CONTRACT],
      ["INTERVIEW_CONTRACT", INTERVIEW_CONTRACT],
    ] as const) {
      expect({ name, carries: contract.includes(MODEL_VOICE_RULES) }).toEqual({
        name,
        carries: true,
      });
    }
  });

  test("the two prompts a test can assemble carry it in full", async () => {
    const { MODEL_VOICE_RULES } = await import("../src/inference/promptMarkers.ts");
    const { puzzlePrompt } = await import("../src/interview/puzzlePrompt.ts");
    const { FIT_SYSTEM } = await import("../src/proposals/paperFit.ts");
    expect(puzzlePrompt([])).toContain(MODEL_VOICE_RULES);
    expect(FIT_SYSTEM).toContain(MODEL_VOICE_RULES);
  });

  test("every builder that sends a system prompt carries the block or a contract that does", async () => {
    const SRC = new URL("../src/", import.meta.url).pathname;
    const carriers = ["MODEL_VOICE_RULES", "PROSE_CONTRACT", "VOICE_CONTRACT", "INTERVIEW_CONTRACT"];
    const found: string[] = [];
    const bare: string[] = [];
    for (const dir of ["interview", "proposals", "twin", "personas", "flow", "workbench"]) {
      for await (const rel of new Glob("**/*.{ts,tsx}").scan(SRC + dir)) {
        const path = `${dir}/${rel}`;
        const text = await Bun.file(SRC + path).text();
        const body = text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
        // A builder is a file that hands a system prompt to a client. A file that
        // passes one it was given (a hook forwarding `puzzlePrompt(blocks)`) names
        // the builder it called, and the builder is what this checks.
        if (!/\bsystem:\s*[^,\n]/.test(body)) continue;
        found.push(path);
        const reaches =
          carriers.some((c) => body.includes(c)) ||
          /\b(?:puzzlePrompt|draftPrompt|assembleTurnPrompt|conversationPrompt)\(/.test(body);
        if (!reaches) bare.push(path);
      }
    }
    // Vacuity guard: the scan has to be finding the builders in the first place.
    expect(found.length).toBeGreaterThanOrEqual(6);
    expect(bare).toEqual([]);
  });
});
