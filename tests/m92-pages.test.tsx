/**
 * M92, ISC-747 to ISC-753: the owner's notes of 2026-10-15 on Starting point,
 * the summaries, the unit of analysis, the puzzle and "Named".
 *
 * - Part 3 (ISC-747, ISC-748): the chat opens by saying which three parts
 *   Abductive asks about and asks the interest in other words than the box; the
 *   right column is "Your answers", with a sentence on how the two sides relate.
 * - Part 4 (ISC-752): a summary reads as text until Edit summary; Auto-generate
 *   summary from chat writes one summary; Summarise is gone from both pages;
 *   the night-ward placeholder is gone.
 * - Part 5 (ISC-749, ISC-750): Other unit of analysis, typed, reaches the model;
 *   the column's heading is an ordinary h2.
 * - Part 6 (ISC-751): the puzzle is the surprise.
 * - Part 7 (ISC-753): Named reads Identified where it means picking out.
 */
import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterAll, describe, expect, mock, test } from "bun:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MockInferenceClient } from "../src/inference/mock.ts";
import type { CompleteRequest, CompleteResult } from "../src/inference/types.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const read = (rel: string) => Bun.file(SRC + rel).text();

let reply = "INTEREST: I want to explore how cooperatives decide on a partner.";
const requests: CompleteRequest[] = [];
class ScriptedClient extends MockInferenceClient {
  override async complete(req: CompleteRequest): Promise<CompleteResult> {
    requests.push(req);
    return { text: reply, model: "scripted", modelVersion: "scripted-1" } as CompleteResult;
  }
}
const realPersonaRun = { ...(await import(`${SRC}ui/personaRun.ts`)) };
await mock.module(`${SRC}ui/personaRun.ts`, () => ({
  ...realPersonaRun,
  activeInferenceClient: () => ({ client: new ScriptedClient(), live: true }),
}));
afterAll(() => void mock.module(`${SRC}ui/personaRun.ts`, () => realPersonaRun));
const realPaperFit = { ...(await import(`${SRC}flow/usePaperFit.ts`)) };
await mock.module(`${SRC}flow/usePaperFit.ts`, () => ({
  ...realPaperFit,
  usePaperFit: () => async () => 0,
  useJudgeOnMount: () => undefined,
  openedCounts: () => new Map(),
}));
afterAll(() => void mock.module(`${SRC}flow/usePaperFit.ts`, () => realPaperFit));

const { MotivationPage, ANSWERS_HEADING, ANSWERS_LEDE } = await import(`${SRC}flow/FramingBand.tsx`);
const { SUMMARY_LEDE } = await import(`${SRC}flow/StationWorkspace.tsx`);
const { EDIT_SUMMARY_LABEL, GENERATE_SUMMARY_LABEL, SUMMARY_STILL_TO_COME } = await import(`${SRC}flow/SummaryControls.tsx`);
const { FRAMING_OPENING, FRAMING_OPENING_LEAD, FRAMING_PROBES, FRAMING_PAGE_QUESTION } = await import(
  `${SRC}interview/stationProbes.ts`
);
const { InMemoryLedgerStore } = await import(`${SRC}ledger/ledger.ts`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);
const projects = await import(`${SRC}state/projects.ts`);
const units = await import(`${SRC}interview/unitOfAnalysis.ts`);
const { levelLines } = await import(`${SRC}interview/levelPrompt.ts`);
const { registerLines, UNIT_EMPTY_FOLLOW_UP, UNIT_KNOWN_LINE } = await import(`${SRC}interview/register.ts`);
const { briefChangeEvents } = await import(`${SRC}flow/stationBrief.ts`);
const { designDigest } = await import(`${SRC}interview/designDigest.ts`);
const { stationById } = await import(`${SRC}flow/stations.ts`);
const { TERMS, OBSTACLES } = await import(`${SRC}ui/Introduction.tsx`);
const { PUZZLE_OFFER_QUESTION } = await import(`${SRC}flow/PuzzleOffer.tsx`);
const { PAGE_HELP } = await import(`${SRC}ui/pageHelp.ts`);

function staticPage(brief = projects.emptyBrief()): string {
  return renderToStaticMarkup(
    React.createElement(LedgerProvider, {
      store: new InMemoryLedgerStore(),
      children: React.createElement(MotivationPage, {
        project: { id: "m92-static", title: "t", stage: "design-brief", brief, createdAt: 1 },
        onChanged: () => {},
      }),
    }),
  );
}

describe("ISC-747: the chat's opening turn at Starting point", () => {
  test("it says which three parts Abductive asks about, then asks the interest in other words than the box", () => {
    expect(FRAMING_OPENING_LEAD).toBe(
      "Abductive will ask about your three starting points in turn: your interest, the literatures and the target journal.",
    );
    expect(FRAMING_PROBES.startingInterest).toBe(
      "What do you want your research to explore, and what draws you to that inquiry?",
    );
    expect(FRAMING_OPENING).toBe(`${FRAMING_OPENING_LEAD} ${FRAMING_PROBES.startingInterest}`);
    expect(FRAMING_PROBES.startingInterest).not.toBe(FRAMING_PAGE_QUESTION.startingInterest);
  });

  test("the bubble shows the opening, and the Interest box keeps the page's own question", () => {
    const html = staticPage();
    expect(html).toContain(FRAMING_OPENING);
    const chat = html.slice(0, html.indexOf('data-testid="motivation-answers"'));
    expect(chat).not.toContain(FRAMING_PAGE_QUESTION.startingInterest);
    const answers = html.slice(html.indexOf('data-testid="motivation-answers"'));
    expect(answers).toContain(FRAMING_PAGE_QUESTION.startingInterest);
  });

  test("the opener leads into a bubble that ends on its question", async () => {
    expect(await read("workbench/Dialogue.tsx")).toContain("bubble.endsWith(` ${stationQuestion}`)");
  });
});

describe("ISC-748 and ISC-750: the right column's heading and the sentence under it", () => {
  test("an h2 reading Your answers, in the app's own h2 style, then one sentence", async () => {
    const html = staticPage();
    const answers = html.slice(html.indexOf('data-testid="motivation-answers"'));
    expect(ANSWERS_HEADING).toBe("Your answers");
    expect(answers).toMatch(/<h2 class="motivation-heading">Your answers<\/h2>/);
    expect(answers).not.toContain(">Summaries<");
    expect(answers).toContain('data-testid="answers-lede"');
    expect(ANSWERS_LEDE).toContain("Auto-generate summary from chat");
    expect(ANSWERS_LEDE).toContain("Edit summary");
    // The heading takes the element's h2 size, as Sources, the ontology tab and Export do.
    const css = await read("ui/styles/design.css");
    const rule = css.slice(css.indexOf(".motivation-heading {"), css.indexOf("}", css.indexOf(".motivation-heading {")));
    expect(rule).not.toContain("font-size");
    expect(rule).not.toContain("font-weight");
  });

  test("Design's Summary carries the same kind of sentence", async () => {
    expect(SUMMARY_LEDE).toContain("Auto-generate summary from chat");
    expect(await read("flow/StationWorkspace.tsx")).toContain('data-testid="summary-lede"');
  });
});

describe("ISC-752: summaries read as text until Edit summary", () => {
  test("Starting point: three read-only summaries, each with both controls, and no Summarise", () => {
    const html = staticPage();
    expect(html).not.toContain('data-testid="framing-starting-interest"');
    const column = html.slice(html.indexOf('data-testid="motivation-answers"'));
    expect(column).not.toContain("<textarea");
    for (const prefix of ["framing-interest", "framing-literatures", "framing-journal"]) {
      expect(html).toContain(`data-testid="${prefix}-edit"`);
      expect(html).toContain(`data-testid="${prefix}-generate"`);
    }
    expect(html.split(EDIT_SUMMARY_LABEL).length - 1).toBe(3 + 1); // three controls and the sentence
    expect(html).toContain(GENERATE_SUMMARY_LABEL);
    expect(html).toContain(SUMMARY_STILL_TO_COME);
    expect(html).not.toContain('data-testid="framing-draft"');
    expect(html).not.toMatch(/>Summarise</);
    // Upload papers and the Hallen 2008 line stay.
    expect(html).toContain("Upload papers");
    expect(html).toContain("Hallen 2008");
  });

  test("a saved summary shows its text", () => {
    const html = staticPage({ ...projects.emptyBrief(), startingInterest: "Cooperatives and their partners." });
    expect(html).toContain('data-testid="framing-starting-interest-text"');
    expect(html).toContain("Cooperatives and their partners.");
  });

  test("Design: the Summarise control is gone, and the summary has both controls", async () => {
    const step = await read("flow/StationWorkspace.tsx");
    expect(step).not.toContain('data-testid="draft-from-conversation"');
    expect(step).toContain('testIdPrefix="station-summary"');
    expect(step).toContain("<SummaryText");
    expect(step).toContain('data-testid="save-station"');
  });

  test("M92 polish: each chip sits beside its summary's label, and the read row has only the two controls", () => {
    const html = staticPage();
    for (const [f, prefix] of [["startingInterest", "framing-interest"], ["seminalCorpus", "framing-literatures"], ["targetVenue", "framing-journal"]]) {
      const row = html.slice(html.indexOf(`data-testid="${prefix}-buttons"`), html.indexOf("</div>", html.indexOf(`data-testid="${prefix}-buttons"`)));
      expect({ f, chipInRow: row.includes("status-chip") }).toEqual({ f, chipInRow: false });
      const chip = html.indexOf(`data-testid="framing-saved-${f}"`);
      expect(chip).toBeGreaterThan(-1);
      expect(chip).toBeLessThan(html.indexOf(`data-testid="${prefix}-buttons"`));
    }
    expect(html).not.toContain('data-testid="framing-save-');
  });

  test("M92 polish: the front page's project-name label is visible, above the field", async () => {
    const intro = await read("ui/Introduction.tsx");
    expect(intro).toContain('<label className="field-label intro-start-label" htmlFor="intro-title-input">');
    expect(intro).not.toContain('<label className="visually-hidden" htmlFor="intro-title-input">');
  });

  test("the create-project fields carry no night-ward placeholder", async () => {
    for (const rel of ["ui/Introduction.tsx", "ui/ProjectList.tsx"]) {
      expect({ rel, has: (await read(rel)).includes("Handoffs on the night ward") }).toEqual({ rel, has: false });
    }
  });

  test("Edit summary opens one box, Save answer writes it, and Auto-generate writes one summary", async () => {
    const id = "m92-edit-generate";
    await projects.saveProject({ id, title: "coops", stage: "design-brief", createdAt: 1, brief: projects.emptyBrief() } as never);
    const store = new InMemoryLedgerStore();
    await store.append({
      id: crypto.randomUUID(),
      ts: 1_700_000_000_001,
      actor: "human",
      projectId: id,
      type: "response",
      text: "I want to explore how cooperatives decide on a partner.",
      station: "framing",
    } as LedgerEvent);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        React.createElement(LedgerProvider, {
          store,
          children: React.createElement(MotivationPage, { project: await projects.getProject(id), onChanged: () => undefined }),
        }),
      );
    });
    const settle = async (n = 10) => {
      for (let i = 0; i < n; i += 1) await act(async () => void (await wait(5)));
    };
    const press = async (tid: string) => {
      const button = host.querySelector(`[data-testid="${tid}"]`) as HTMLElement;
      expect({ tid, found: button !== null }).toEqual({ tid, found: true });
      const k = Object.keys(button).find((x) => x.startsWith("__reactProps$"))!;
      await act(async () => {
        (button as unknown as Record<string, { onClick: () => void }>)[k]!.onClick();
      });
      await settle();
    };
    await settle();
    expect(host.querySelector('[data-testid="motivation-answers"] textarea')).toBeNull();

    // Edit summary: one box opens, the other two stay text.
    await press("framing-journal-edit");
    const boxes = host.querySelectorAll('[data-testid="motivation-answers"] textarea');
    expect(boxes.length).toBe(1);
    expect(boxes[0]?.getAttribute("data-testid")).toBe("framing-venue");
    const box = boxes[0] as HTMLTextAreaElement;
    const boxKey = Object.keys(box).find((x) => x.startsWith("__reactProps$"))!;
    await act(async () => {
      (box as unknown as Record<string, { onChange: (e: unknown) => void }>)[boxKey]!.onChange({
        target: { value: "Organization Science" },
      });
    });
    await settle(3);
    await press("framing-save-targetVenue");
    expect(host.querySelector('[data-testid="motivation-answers"] textarea')).toBeNull();
    const bound = (await store.readAll()).filter((e: LedgerEvent) => e.type === "bound");
    expect(bound.some((e: LedgerEvent) => e.type === "bound" && e.statement === "Organization Science")).toBe(true);
    expect((await projects.getProject(id))?.brief.targetVenue).toBe("Organization Science");

    // Auto-generate summary from chat: one call, for the interest alone, shown as text.
    requests.length = 0;
    await press("framing-interest-generate");
    const drafts = requests.filter((r) => r.system.includes("summarising the researcher's own answer"));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.system).toContain("INTEREST:");
    expect(drafts[0]?.system).not.toContain("JOURNAL:");
    expect(host.querySelector('[data-testid="framing-starting-interest-text"]')?.textContent).toBe(
      "I want to explore how cooperatives decide on a partner.",
    );
    expect(host.querySelector('[data-testid="motivation-answers"] textarea')).toBeNull();
    const briefDrafts = (await store.readAll()).filter((e: LedgerEvent) => e.type === "brief-draft");
    expect(briefDrafts.map((e: LedgerEvent) => (e.type === "brief-draft" ? e.field : ""))).toEqual(["startingInterest"]);

    // M92 polish: a draft is unsaved text, so its row is Save answer and Cancel, and the chip says Draft.
    expect(host.querySelector('[data-testid="framing-saved-startingInterest"]')?.textContent).toBe("Draft");
    expect(host.querySelector('[data-testid="framing-interest-editing"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="framing-save-startingInterest"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="framing-interest-generate"]')).toBeNull();
    // The lead's ruling: a draft's row is Save answer, Edit summary, Cancel, and
    // Edit summary opens the box with the draft in it.
    const draftRow = host.querySelector('[data-testid="framing-interest-editing"]')!;
    expect([...draftRow.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Save answer", "Edit summary", "Cancel"]);
    await press("framing-interest-edit");
    const open = host.querySelector('[data-testid="framing-starting-interest"]') as HTMLTextAreaElement;
    expect(open.value).toBe("I want to explore how cooperatives decide on a partner.");
    const editRow = host.querySelector('[data-testid="framing-interest-editing"]')!;
    expect([...editRow.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Save answer", "Cancel"]);
    // Cancel closes the box on the draft; a second Cancel puts back the answer on the record.
    await press("framing-interest-cancel");
    expect(host.querySelector('[data-testid="framing-starting-interest"]')).toBeNull();
    await press("framing-interest-cancel");
    expect(host.querySelector('[data-testid="framing-starting-interest-text"]')?.getAttribute("data-empty")).toBe("true");
    expect(host.querySelector('[data-testid="framing-interest-edit"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="framing-saved-startingInterest"]')?.textContent).toBe("Not started");
    expect((await projects.getProject(id))?.brief.startingInterest ?? "").toBe("");
    root.unmount();
    host.remove();
  });
});

describe("ISC-749: Other unit of analysis", () => {
  test("a sixth option, after A field, with its own field label", () => {
    expect(units.UNITS).toEqual(["person", "team", "organisation", "community", "field", "other"]);
    expect(units.UNIT_OPTION.other).toBe("Other");
    expect(units.UNIT_OTHER_LABEL).toBe("Other unit of analysis");
  });

  test("the box appears only under Other, in the Context step's source", async () => {
    const step = await read("flow/StationWorkspace.tsx");
    expect(step).toContain('stationId === "context" && brief.unit === "other"');
    expect(step).toContain("{UNIT_OTHER_LABEL}");
  });

  test("a typed unit goes on the record, survives a reload, and reaches the prompt", async () => {
    const before = projects.emptyBrief();
    const after = { ...before, unit: "other" as const, unitOther: "regional energy networks" };
    const rows = briefChangeEvents("p", before, after);
    expect(rows.map((r: LedgerEvent) => (r.type === "bound" ? r.statement : ""))).toContain("Other: regional energy networks");
    // Choosing Other with nothing typed files nothing yet.
    expect(briefChangeEvents("p", before, { ...before, unit: "other" as const }).length).toBe(0);
    // An old brief and a new one both load.
    expect(projects.normalizeBrief({ unit: "team" }).unit).toBe("team");
    expect(projects.normalizeBrief(after).unitOther).toBe("regional energy networks");
    const id = "m92-unit-other";
    await projects.saveProject({ id, title: "u", stage: "design-brief", createdAt: 1, brief: before } as never);
    await projects.updateBrief(id, { unit: "other", unitOther: "regional energy networks" });
    const back = (await projects.getProject(id))?.brief;
    expect(back?.unitOther).toBe("regional energy networks");
    const digest = designDigest(back);
    const lines = levelLines({ unit: digest.unit, unitOther: digest.unitOther }).join("\n");
    expect(lines).toContain('"regional energy networks"');
    expect(lines).not.toContain("haven't identified a unit");
  });

  test("an empty Other reads as no unit, so Process may still ask for it", () => {
    expect(units.effectiveUnit("other", "  ")).toBeUndefined();
    expect(levelLines({ unit: "other", unitOther: "" }).join("\n")).toContain("haven't identified a unit");
    expect(registerLines("process", true, units.effectiveUnit("other", ""))).toContain(UNIT_EMPTY_FOLLOW_UP);
    expect(registerLines("process", true, units.effectiveUnit("other", "networks"))).toContain(UNIT_KNOWN_LINE);
  });
});

describe("ISC-751: the puzzle is the surprise", () => {
  const OWNER = "The puzzle is the surprise: what you see, or expect to see, that current accounts can't explain.";
  test("every definition agrees with the owner's sentence", () => {
    expect(stationById("bind").apart).toBe(
      `A bind is the tension that the people in your setting feel. ${OWNER} Not every project has a bind.`,
    );
    expect(stationById("puzzle").prompt).toBe(
      "What do you see, or expect to see, in your setting that current accounts can't explain?",
    );
    expect(stationById("puzzle").blurb).toContain("surprise");
    const term = TERMS.find((t: { term: string }) => t.term === "Puzzle");
    expect(term?.meaning).toBe("The surprise: what you see, or expect to see, that current accounts can't explain.");
    expect(term?.aka).toBe("research question, anomaly");
    expect(OBSTACLES.find((o: { id: string }) => o.id === "topic-not-puzzle")?.body).toContain(
      "from a puzzle (what you see, or expect to see, that current accounts can't explain).",
    );
    expect(PUZZLE_OFFER_QUESTION).toBe("Is this the surprise that current accounts can't explain?");
  });
});

describe("ISC-753: Named reads Identified where it means picking out", () => {
  test("the paper chip and the Help sentences", async () => {
    expect(await read("flow/PaperFitChip.tsx")).toContain('named: "Identified"');
    const help = JSON.stringify(PAGE_HELP);
    expect(help).toContain("Abductive marks a paper Identified until you upload it");
    expect(help).toContain("Identify the papers that you expect to draw on.");
    expect(help).toContain("the literatures that you identified at Starting point");
    expect(help).not.toContain("marks a paper Named");
  });

  test("the prompts", () => {
    expect(levelLines({}).join("\n")).toContain("They haven't identified a unit of analysis yet.");
    expect(UNIT_KNOWN_LINE).toContain("They identified their unit of analysis at Context.");
  });
});
