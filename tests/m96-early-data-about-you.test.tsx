/**
 * M96 (the owner, 2026-10-30):
 *
 *   "the early data discussion should consider all of the data that has been
 *   uploaded as context. there should be no data type or suggest concepts button
 *   at the bottom of the early data screen. The about you should move to the
 *   starting point section as discussed. The tool should not use the verb 'read'
 *   or 'reads'." Then: "the keyboard shortcuts should be eliminated", and "it
 *   shouldn't be called a walk. It should be called a walkthrough".
 *
 * ISC-790 to ISC-795.
 */
import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Glob } from "bun";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { conversationPrompt, type ConversationPromptInput } from "../src/interview/conversationPrompt.ts";
import { EARLY_DATA_BUDGET_CHARS, earlyDataScope } from "../src/flow/earlyData.ts";
import { earlyDataScopeSentence } from "../src/flow/EarlyDataScopeLine.tsx";
import { AboutYouBlock, ABOUT_YOU_LINE } from "../src/help/AboutYouBlock.tsx";
import { aboutYouSkipped, readAboutYou, resetAboutYouForTests, ABOUT_YOU_KEY, ABOUT_YOU_SKIPPED_KEY } from "../src/help/aboutYou.ts";
import { aboutYouHelpLine } from "../src/ui/HelpChat.tsx";
import { voiceBreaks } from "../src/inference/voiceRetry.ts";
import { MODEL_VOICE_RULES } from "../src/inference/promptMarkers.ts";
import type { Chunk, StoredDocument } from "../src/state/chunks.ts";

const SRC = new URL("../src/", import.meta.url).pathname;

const doc = (id: string, name: string, kind: StoredDocument["kind"], createdAt: number): StoredDocument => ({
  id,
  projectId: "p",
  name,
  kind,
  createdAt,
  chunkCount: 1,
});
const chunk = (id: string, documentId: string, kind: Chunk["kind"], text: string, index = 0): Chunk => ({
  id,
  projectId: "p",
  documentId,
  kind,
  text,
  index,
});

describe("Early data considers every data file (ISC-790)", () => {
  const documents = [
    doc("d1", "ward-notes.txt", "fieldnote", 1),
    doc("d2", "nurse-interview.txt", "transcript", 2),
    doc("d3", "Smith 2019.pdf", "literature", 3),
  ];
  const chunks = [
    chunk("c1", "d1", "fieldnote", "The charge nurse said the sheet aloud.", 0),
    chunk("c2", "d1", "fieldnote", "Nobody looked up from the monitors.", 1),
    chunk("c3", "d2", "transcript", "I stopped trusting the handover sheet in March."),
    chunk("c4", "d3", "literature", "Handover rituals stabilise ward order."),
  ];

  test("every data passage, in full and named by file, and the papers left out", () => {
    const scope = earlyDataScope(documents, chunks);
    expect(scope.considered.map((d) => d.name)).toEqual(["ward-notes.txt", "nurse-interview.txt"]);
    expect(scope.leftOut).toEqual([]);
    const input: ConversationPromptInput = {
      place: "early-data",
      placeLabel: "Early data",
      purpose: "Your material.",
      stationQuestion: "What has your early material shown you that you didn't expect?",
      mode: "interrogation",
      opener: false,
      nothingWrittenYet: false,
      stepAnswered: true,
      chunks: scope.chunks,
      files: { names: new Map(scope.considered.map((d) => [d.id, d.name] as const)), leftOut: [] },
      ontologySummary: "",
      here: [],
      earlier: [],
    };
    const prompt = conversationPrompt(input);
    expect(prompt).toContain("## Material in context: every data file that they have added");
    expect(prompt).toContain("[[chunk:c1]] (ward-notes.txt, passage 1) The charge nurse said the sheet aloud.");
    expect(prompt).toContain("[[chunk:c2]] (ward-notes.txt, passage 2) Nobody looked up from the monitors.");
    expect(prompt).toContain("[[chunk:c3]] (nurse-interview.txt, passage 1) I stopped trusting the handover sheet in March.");
    expect(prompt).not.toContain("Handover rituals stabilise ward order.");
  });

  test("a corpus past the budget leaves whole files out and names them, on screen and in the prompt", () => {
    const big = "x".repeat(200);
    const scope = earlyDataScope(documents, chunks.map((c) => (c.documentId === "d2" ? { ...c, text: big } : c)), 150);
    expect(scope.considered.map((d) => d.name)).toEqual(["ward-notes.txt"]);
    expect(scope.leftOut.map((d) => d.name)).toEqual(["nurse-interview.txt"]);
    expect(scope.chunks.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(earlyDataScopeSentence(1, 2)).toBe("This step considers one of your two data files on Sources, in full.");
    expect(EARLY_DATA_BUDGET_CHARS).toBeGreaterThanOrEqual(300_000);
  });

  test("the line at the top counts the files in words", () => {
    expect(earlyDataScopeSentence(1, 1)).toBe("This step considers your one data file on Sources, in full.");
    expect(earlyDataScopeSentence(4, 4)).toBe("This step considers your four data files on Sources, in full.");
  });

  test("the conversation hands the scope over at Early data only", () => {
    const dialogue = readFileSync(`${SRC}workbench/Dialogue.tsx`, "utf8");
    expect(dialogue).toContain('station === "early-data" && documents !== undefined');
    expect(dialogue).toContain("earlyDataScope(documents, chunks)");
  });
});

describe("About you lives on Starting point (ISC-793)", () => {
  afterEach(() => {
    try {
      localStorage.removeItem(ABOUT_YOU_KEY);
      localStorage.removeItem(ABOUT_YOU_SKIPPED_KEY);
    } catch {
      /* the test DOM's storage */
    }
    resetAboutYouForTests();
  });

  async function mount() {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(React.createElement(AboutYouBlock)));
    return { host, root };
  }
  const find = (host: Element, id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  function props(el: Element): Record<string, (e: unknown) => void> {
    const key = Object.keys(el).find((k) => k.startsWith("__reactProps$")) ?? "";
    return (el as unknown as Record<string, Record<string, (e: unknown) => void>>)[key] ?? {};
  }

  test("the questions show on a first visit, with the line saying who considers them", async () => {
    const { host, root } = await mount();
    expect(find(host, "about-you-stage")).not.toBeNull();
    expect(find(host, "about-you-skip")).not.toBeNull();
    expect(host.textContent ?? "").toContain(ABOUT_YOU_LINE);
    expect(ABOUT_YOU_LINE).toContain("Abductive uses these answers only in the help chat");
    root.unmount();
    host.remove();
  });

  test("Save collapses the block to one line, and Edit opens it again", async () => {
    const { host, root } = await mount();
    const stage = find(host, "about-you-stage") as HTMLSelectElement;
    await act(async () => {
      stage.value = "phd-later";
      stage.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const field = find(host, "about-you-field") as HTMLInputElement;
    await act(async () => {
      field.value = "sociology";
      props(field).onChange?.({ target: field });
    });
    await act(async () => props(find(host, "about-you-save")!).onClick?.({}));
    expect(find(host, "about-you-summary")?.textContent).toContain("You: PhD student in year three or later, sociology.");
    expect(find(host, "about-you-stage")).toBeNull();
    expect(readAboutYou().field).toBe("sociology");
    await act(async () => props(find(host, "about-you-edit")!).onClick?.({}));
    expect((find(host, "about-you-field") as HTMLInputElement).value).toBe("sociology");
    root.unmount();
    host.remove();
  });

  test("Skip collapses the block without answers, and the skip is kept", async () => {
    const { host, root } = await mount();
    await act(async () => props(find(host, "about-you-skip")!).onClick?.({}));
    expect(find(host, "about-you-summary")?.textContent).toContain("You haven't answered About you.");
    expect(aboutYouSkipped()).toBe(true);
    root.unmount();
    host.remove();
    const again = await mount();
    expect(find(again.host, "about-you-stage")).toBeNull();
    again.root.unmount();
    again.host.remove();
  });

  test("the Help panel keeps one line that points at Starting point", () => {
    expect(aboutYouHelpLine({})).toBe("About you is on Starting point. Abductive uses your answers there to fit the help chat's advice to you.");
    expect(aboutYouHelpLine({ stage: "faculty", field: "strategy" })).toBe(
      "About you: Faculty, strategy. You can change these answers on Starting point.",
    );
    const chat = readFileSync(`${SRC}ui/HelpChat.tsx`, "utf8");
    expect(chat).not.toContain("about-you-stage");
    expect(chat).not.toContain("help-about-stage");
    const page = readFileSync(`${SRC}flow/FramingBand.tsx`, "utf8");
    expect(page).toContain("<AboutYouBlock />");
  });
});

describe("the keyboard shortcuts are gone (ISC-794)", () => {
  test("the app registers no global key listener beyond the ARIA widgets' own keys", async () => {
    const found: string[] = [];
    for await (const rel of new Glob("**/*.{ts,tsx}").scan(SRC)) {
      const text = readFileSync(SRC + rel, "utf8");
      if (/\b(?:document|window|doc)\.addEventListener\(\s*["']keydown["']/.test(text)) found.push(rel);
    }
    /* The roving groups' arrows, Home and End (an ARIA list and grid), and
       Escape on an open popover. */
    expect(found.sort()).toEqual(["ui/components/Popover.tsx", "ui/roving.ts"]);
    expect(readFileSync(`${SRC}ui/roving.ts`, "utf8")).not.toMatch(/e\.key === "[a-z?\/\[\]]"/);
  });

  test("the keyboard module and its stylesheet are gone, and Search opens from its button", () => {
    let gone = false;
    try {
      readFileSync(`${SRC}ui/keyboard/bindings.ts`, "utf8");
    } catch {
      gone = true;
    }
    expect(gone).toBe(true);
    const shell = readFileSync(`${SRC}ui/AppShell.tsx`, "utf8");
    expect(shell).toContain("setSearching(true)");
    expect(shell).not.toContain("KeyboardLayer");
    expect(shell).not.toContain("<Caps");
  });

  test("no rendered string mentions a shortcut or prints a key chord", async () => {
    const { l20Runs } = await import("./copyBarScan.ts");
    const offenders = l20Runs()
      .map((r) => `${r.path}: ${r.run}`)
      .filter((line) => /\bshortcuts?\b|\bkeystrokes?\b|⌘|\bCtrl\+|\bCmd\+|\bMod\+|press \?/i.test(line));
    expect(offenders).toEqual([]);
  });
});

describe("the model's replies keep the two words out (L23, L24)", () => {
  test("the voice gate catches read and walk in the model's prose, and leaves a quote of the researcher alone", () => {
    const rules = (s: string) => voiceBreaks(s).flatMap((o) => o.breaks.map((b) => b.rule));
    expect(rules("Abductive reads your field notes for the surprise.")).toContain("L23");
    expect(rules("The walk of record shows the turn.")).toContain("L24");
    expect(rules('You wrote "I stopped reading the sheet", and the sheet matters.')).not.toContain("L23");
    expect(rules("Walk me through the handover.")).not.toContain("L24");
    expect(MODEL_VOICE_RULES).toContain('Do not use the verb "read" in any form.');
    expect(MODEL_VOICE_RULES).toContain('Do not call anything a "walk". Say "walkthrough".');
  });
});

void wait;
