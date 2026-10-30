/**
 * M96b (the owner, 2026-10-30, on the raw passage code in an Early data reply:
 * "Yes, show it as a label"). ISC-796 to ISC-798.
 */
import "fake-indexeddb/auto";
import { useDom } from "./dom.ts";
useDom();

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  citationLabel,
  citationSegments,
  passageLookup,
  REMOVED_PASSAGE_LABEL,
  withCitationLabels,
} from "../src/views/citations.ts";
import { Cited, CitationScope } from "../src/ui/CitedText.tsx";
import { Turn } from "../src/workbench/Dialogue.tsx";
import { READ_WORD, WALK_NOUN, CARD_WORD } from "../src/copy/rules.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const lookup = passageLookup(
  [
    { id: "c1", documentId: "d1", index: 0 },
    { id: "c2", documentId: "d1", index: 4 },
    { id: "c3", documentId: "d2", index: 2 },
  ],
  [
    { id: "d1", name: "colleague-b-notes.txt" },
    { id: "d2", name: "ward-notes.txt" },
  ],
);

describe("the renderer (ISC-796)", () => {
  test("a known code is the file and the passage number that Sources shows", () => {
    expect(citationLabel("c2", lookup)).toBe("colleague-b-notes.txt, passage 5");
    const html = renderToStaticMarkup(
      React.createElement(CitationScope, { projectId: "p1", lookup }, React.createElement(Cited, { text: "See [[chunk:c2]] again." })),
    );
    expect(html).toContain('href="#/study/p1/material/passage-c2"');
    expect(html).toContain("colleague-b-notes.txt, passage 5");
    expect(html).not.toContain("[[chunk:");
  });

  test("a code for a removed file is a plain label that says so", () => {
    expect(citationLabel("gone", lookup)).toBe(REMOVED_PASSAGE_LABEL);
    const html = renderToStaticMarkup(
      React.createElement(CitationScope, { projectId: "p1", lookup }, React.createElement(Cited, { text: "At [[chunk:gone]]." })),
    );
    expect(html).toContain(REMOVED_PASSAGE_LABEL);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("[[chunk:");
  });

  test("several codes in one message each get their own label, in order", () => {
    const parts = citationSegments("Compare [[chunk:c1]] with [[chunk:c3]] and [[chunk:x]].", lookup);
    expect(parts.filter((p) => p.kind === "cite").map((p) => (p.kind === "cite" ? p.label : ""))).toEqual([
      "colleague-b-notes.txt, passage 1",
      "ward-notes.txt, passage 3",
      REMOVED_PASSAGE_LABEL,
    ]);
    expect(withCitationLabels("Compare [[chunk:c1]] with [[chunk:c3]].", lookup)).toBe(
      "Compare colleague-b-notes.txt, passage 1 with ward-notes.txt, passage 3.",
    );
  });

  test("outside a project the label still replaces the code", () => {
    const html = renderToStaticMarkup(React.createElement(Cited, { text: "At [[chunk:c1]]." }));
    expect(html).not.toContain("[[chunk:");
  });

  test("the label copy keeps the copy bar", () => {
    for (const s of [REMOVED_PASSAGE_LABEL, citationLabel("c1", lookup), citationLabel("c1", undefined)]) {
      expect({ s, read: READ_WORD.test(s), walk: WALK_NOUN.test(s), card: CARD_WORD.test(s) }).toEqual({ s, read: false, walk: false, card: false });
    }
  });
});

describe("no rendered chat or export string shows a raw code (ISC-797)", () => {
  test("a chat turn with a code renders the label", () => {
    const entry = { id: "t1", kind: "response", text: "In [[chunk:c3]] you wrote it down.", ts: 1 } as never;
    const html = renderToStaticMarkup(
      React.createElement(CitationScope, { projectId: "p1", lookup }, React.createElement(Turn, { entry })),
    );
    expect(html).toContain("ward-notes.txt, passage 3");
    expect(html).not.toContain("[[chunk:");
  });

  test("every surface that shows model text goes through the label, and the exports swap codes on the way out", () => {
    for (const [file, mark] of [
      ["workbench/Dialogue.tsx", "<Cited text={streaming} />"],
      ["ui/HelpChat.tsx", "<Cited text={x.answer} />"],
      ["flow/SummaryControls.tsx", "<Cited text={props.text} />"],
      ["flow/PuzzleOffer.tsx", "<Cited text={state.text} />"],
      ["views/Divergence.tsx", "<Cited text={challenge.text} />"],
      ["ui/ConceptsView.tsx", "<Cited text={accepted.text} />"],
      ["workbench/ExportBar.tsx", "withCitationLabels(buildOntologyMemo("],
      ["workbench/ExportBar.tsx", "withCitationLabels(buildSessionReplay("],
      ["export/exportContains.ts", "withCitationLabels(f.content, passages)"],
    ] as const) {
      expect({ file, has: readFileSync(SRC + file, "utf8").includes(mark) }).toEqual({ file, has: true });
    }
  });
});

/* M96c (the coordinator, 2026-10-30): researchers never see "passage 0". */
describe("the first passage is passage 1, on Sources and in a label (M96c, ISC-799)", () => {
  test("Sources marks the first passage #1, and a label calls it passage 1", async () => {
    // opened and cited are off, so the row label is the bare "Passage 1".
    const { PassageRow } = await import("../src/flow/Passage.tsx").then((m) => ({ PassageRow: (m as Record<string, unknown>)["Passage"] }));
    const html = renderToStaticMarkup(
      React.createElement(PassageRow as never, { chunk: { id: "c1", projectId: "p1", documentId: "d1", kind: "fieldnote", text: "First line.", index: 0 } } as never),
    );
    expect(html).toContain(">#1<");
    expect(html).toContain("Passage 1");
    expect(citationLabel("c1", lookup)).toBe("colleague-b-notes.txt, passage 1");
  });
});
