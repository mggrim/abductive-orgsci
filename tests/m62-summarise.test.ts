/**
 * M62, ISC-598 (owner, 2026-09-30): "what is the suggest starting point button
 * for? It seems like that is a summarize button." The control that drafts the
 * Starting point's three summaries from the conversation, and the one that drafts
 * a Design step's summary from its conversation, are the same act and read
 * "Summarise". History says what the act was: "Summarised from the conversation".
 * Record event names stay (`brief-draft`), and so do the test ids.
 */
import { describe, expect, test } from "bun:test";
import { projectLedger } from "../src/workbench/Instrumentation.tsx";
import { ROUTE_LINE } from "../src/views/provenance.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const read = (rel: string) => Bun.file(SRC + rel).text();

describe("one label for one act", () => {
  /* M92, ISC-752 (Matthew, 2026-10-15): "remove the summarize button". Each
   * summary has its own Auto-generate summary from chat, on both pages. */
  test("Starting point's control reads Auto-generate summary from chat, and Summarise is gone", async () => {
    const band = await read("flow/FramingBand.tsx");
    expect(band).not.toContain('{drafting ? "Summarising…" : "Summarise"}');
    expect(band).not.toContain('data-testid="framing-draft"');
    expect(band).toContain("<SummaryButtons");
    expect(band).not.toContain("Suggest starting point");
    expect(await read("flow/SummaryControls.tsx")).toContain('export const GENERATE_SUMMARY_LABEL = "Auto-generate summary from chat";');
  });

  test("a Design step's control reads the same, and Summarise is gone", async () => {
    const step = await read("flow/StationWorkspace.tsx");
    expect(step).not.toContain('{drafting ? "Summarising…" : "Summarise"}');
    expect(step).not.toContain('data-testid="draft-from-conversation"');
    expect(step).toContain("<SummaryButtons");
    expect(step).not.toContain('"Suggest answer"');
  });

  test("the mark on a summarised field names the act", async () => {
    const line = "Abductive wrote this from your replies. Save answer makes the summary yours.";
    expect(await read("flow/FramingBand.tsx")).toContain(line);
    expect(await read("flow/StationWorkspace.tsx")).toContain(line);
  });

  test("the notes beside the control name a summary", async () => {
    for (const rel of ["flow/FramingBand.tsx", "flow/StationWorkspace.tsx"]) {
      const text = await read(rel);
      expect({ rel, said: text.includes("Abductive writes a summary from your words.") }).toEqual({ rel, said: true });
      expect({ rel, failed: text.includes("Abductive couldn't write a summary: ") }).toEqual({ rel, failed: true });
      expect({ rel, old: text.includes("writes a suggestion from your words") }).toEqual({ rel, old: false });
    }
  });
});

describe("History and the provenance popover say Summarised", () => {
  const draft = {
    id: "d1",
    ts: 1,
    actor: "persona:interviewer",
    projectId: "p",
    model: "m",
    modelVersion: "m",
    type: "brief-draft",
    station: "framing",
    field: "seminalCorpus",
    text: "Weick on sensemaking",
    fromTurnIds: [],
  } as unknown as LedgerEvent;

  test("the row reads Summarised from the conversation", () => {
    expect(projectLedger([draft])[0]?.happened).toBe("Summarised from the conversation");
  });

  test("the filter names the kind as a summary", async () => {
    expect(await read("workbench/Instrumentation.tsx")).toContain(
      `"brief-draft": "an answer that Abductive summarised from the conversation"`,
    );
  });

  test("the popover says the answer was summarised", () => {
    expect(ROUTE_LINE.drafted).toBe("Abductive summarised this answer from your chat, and you saved it.");
  });

  test("the event name stays", async () => {
    expect(await read("flow/useBriefDraft.ts")).toContain('type: "brief-draft"');
  });
});

/**
 * The owner's amendment to item 2 (2026-09-30): Summarise sits at the foot of
 * the Summaries column on Starting point, under the three fields beside their
 * save controls, and at the foot of a Design step's Summary column beside Save
 * answer. Nothing sits above the conversation now.
 */
describe("Auto-generate summary from chat sits under each summary (M92, ISC-752)", () => {
  test("Starting point: three controls inside the answers column, none over the chat", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { MotivationPage } = await import("../src/flow/FramingBand.tsx");
    const { LedgerProvider } = await import("../src/state/ledgerContext.tsx");
    const { InMemoryLedgerStore } = await import("../src/ledger/ledger.ts");
    const { emptyBrief } = await import("../src/state/projects.ts");
    const html = renderToStaticMarkup(
      createElement(LedgerProvider, {
        store: new InMemoryLedgerStore(),
        children: createElement(MotivationPage, {
          project: { id: "p62f", title: "t", stage: "design-brief", brief: emptyBrief(), createdAt: 1 },
          onChanged: () => {},
        }),
      }),
    );
    const aside = html.indexOf('data-testid="motivation-aside"');
    const answers = html.indexOf('data-testid="motivation-answers"');
    expect(aside).toBeLessThan(answers);
    expect(html.slice(aside, answers)).not.toContain("-generate");
    for (const [text, button] of [
      ["framing-starting-interest-text", "framing-interest-generate"],
      ["framing-seminal-corpus-text", "framing-literatures-generate"],
      ["framing-venue-text", "framing-journal-generate"],
    ]) {
      expect(html.indexOf(`data-testid="${button}"`)).toBeGreaterThan(html.indexOf(`data-testid="${text}"`));
    }
  });

  test("a Design step: under the summary, with Save answer and Cancel in its place while text is unsaved", async () => {
    const step = (await read("flow/StationWorkspace.tsx")).replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    const text = step.indexOf("<SummaryText");
    const edit = step.indexOf("<EditButtons");
    const buttons = step.indexOf("<SummaryButtons");
    expect(text).toBeGreaterThan(-1);
    expect(edit).toBeGreaterThan(text);
    expect(step.slice(edit, buttons)).toContain("save={saveButton}");
    expect(buttons).toBeGreaterThan(edit);
  });
});
