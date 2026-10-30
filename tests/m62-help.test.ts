/**
 * M62, ISC-600 (owner, 2026-09-30): "Remove explanatory sentences from the pages
 * ... Instead, there should be a help button at the top right, which is
 * contextually aware. Based on the page you're on, it should provide
 * explanations of what the page is trying to accomplish. If the user wants to
 * search for more help, there should be an option to get more help."
 *
 * One Help control per page, marked "?" and named "Help for this page", at the
 * top right of the study header, the Projects page and the Model access page.
 * It opens a panel for the current route: the page's purpose, the parts of the
 * page (the sentences that left the page, rewritten where the copy standard
 * needed it), and More help, which opens the walkthrough at the screen covering
 * the page, with Go to front page beneath the walkthrough. M32's route-help
 * chip and its ledes fold into it.
 *
 * What stays on the pages: state sentences, empty states, waiting-question
 * notes, errors, field help lines (the questions), the keys that say what a mark
 * on a grid or a table means, the descriptions of individual files and options,
 * and the walkthrough's own text.
 */
import "fake-indexeddb/auto";
import { useDom } from "./dom.ts";
useDom();

import { describe, expect, test } from "bun:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { GETTING_STARTED_SCREENS, STUDY_TABS, parseHash, walkPath } from "../src/ui/routes.ts";
import { WALKTHROUGH_SCREENS } from "../src/ui/Walkthrough.tsx";
import { HELP_PAGES, HISTORY_HELP, PAGE_HELP, helpText } from "../src/ui/pageHelp.ts";
import { HelpControl } from "../src/ui/HelpControl.tsx";
import { stationById, STATIONS } from "../src/flow/stations.ts";
import { sentencesOf, uncommented } from "./copyBarScan.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const flatSource = async (rel: string) => uncommented(await Bun.file(SRC + rel).text()).replace(/\s+/g, " ");
const flat = (s: string) => s.replace(/\s+/g, " ").trim();

describe("every page has its help", () => {
  test("the five tabs, Projects and Model access, and nothing else", () => {
    expect([...HELP_PAGES]).toEqual([...STUDY_TABS, "studies", "settings"]);
    expect(Object.keys(PAGE_HELP).sort()).toEqual([...HELP_PAGES].sort());
  });

  for (const page of ["motivation", "design", "material", "ontology", "exports", "studies", "settings"] as const) {
    test(`${page}: a purpose of two or three sentences, the parts, and a walkthrough screen`, () => {
      const help = PAGE_HELP[page];
      const sentences = help.purpose.flatMap((p) => sentencesOf(p)).filter((s) => s.trim() !== "");
      expect({ page, n: sentences.length >= 2 && sentences.length <= 3 }).toEqual({ page, n: true });
      expect(help.parts.length).toBeGreaterThan(0);
      for (const part of help.parts) {
        expect({ page, part: part.name, says: part.says.length > 0 }).toEqual({ page, part: part.name, says: true });
      }
      expect(help.screen).toBeGreaterThanOrEqual(0);
      expect(help.screen).toBeLessThan(WALKTHROUGH_SCREENS);
    });
  }

  test("More help lands on the screen that covers the page", () => {
    // The owner's pairing: Starting point and Design to the two loops, Sources
    // (and History, which every study page's help carries) to The outputs of a
    // project (M68); Projects and Model access to the screen that creates a project
    // and says where the data lives.
    expect(PAGE_HELP.motivation.screen).toBe(1);
    expect(PAGE_HELP.design.screen).toBe(1);
    expect(PAGE_HELP.material.screen).toBe(2);
    for (const page of ["ontology", "exports"] as const) expect(PAGE_HELP[page].screen).toBe(2);
    expect(PAGE_HELP.studies.screen).toBe(3);
    expect(PAGE_HELP.settings.screen).toBe(3);
  });

  test("the walkthrough has an address per screen, and a bad one lands on the first", () => {
    expect(GETTING_STARTED_SCREENS).toBe(WALKTHROUGH_SCREENS);
    expect(walkPath(1)).toBe("#/getting-started/2");
    expect(parseHash(walkPath(1))).toEqual({ view: "intro", walk: 1 });
    expect(parseHash("#/getting-started")).toEqual({ view: "intro", walk: 0 });
    expect(parseHash("#/getting-started/99")).toEqual({ view: "intro", walk: WALKTHROUGH_SCREENS - 1 });
    expect(parseHash("#/")).toEqual({ view: "intro" });
  });
});

/** Each sentence that left a page, the file it left, and its words in the help. */
const MOVED: readonly { readonly file: string; readonly was: string; readonly now: string }[] = [
  // Starting point.
  { file: "flow/FramingBand.tsx", was: "Talk your starting point through. Summarise turns this conversation into the three summaries.", now: "Talk your starting point through. Auto-generate summary from chat turns this conversation into the summary above the control." }, // M92, ISC-752
  { file: "flow/FramingBand.tsx", was: "Abductive suggests these three answers from your conversation; you edit and save them.", now: "Auto-generate summary from chat writes one summary in two to five sentences from your replies, keeps your phrasing, and leaves out your questions and asides." }, // M74b, ISC-664; M92, ISC-752
  { file: "flow/FramingBand.tsx", was: "Answer these three questions once and revise them as the project changes. The checks read these three answers.", now: "Answer these three questions once and revise them as the project changes." },
  // The composer, on every page with a conversation.
  { file: "workbench/Dialogue.tsx", was: "Abductive records each of these moves. Pass on one topic three times and Abductive stops raising it.", now: "Abductive records each of these replies. Pass on one topic three times and Abductive stops raising it." },
  // Design.
  { file: "workbench/Workbench.tsx", was: "Your answers here shape every question Abductive asks you and every check it runs.", now: "Your answers on Design shape every question that Abductive asks you." },
  { file: "flow/StationWorkspace.tsx", was: "One statement of the points that this conversation has settled.", now: "One statement of the points that this conversation has settled. Abductive saves your words exactly as you wrote them." },
  // Sources.
  { file: "ui/StudyViews.tsx", was: "Your data grounds the claims in your model. The Early data step reads your data to suggest more claims.", now: "Your data grounds the claims in your ontology. At the Early data step, Abductive reads your data to suggest more claims." },
  { file: "ui/StudyViews.tsx", was: "Everything you're building this project on. You can see which passages you have opened and which you haven't.", now: "Everything that you're building this project on. You can see which passages you have opened and which you haven't." },
  { file: "flow/SeminalCorpus.tsx", was: "Abductive files anything you drop here as a paper, and reads it to place your project in a conversation.", now: "Abductive files anything that you add under Papers as a paper, and reads each paper to place your project in a conversation." },
  { file: "flow/SeminalCorpus.tsx", was: "When a check asks for a claim's grounds, Abductive reads your data instead.", now: "To check a claim's grounds, Abductive reads your data instead." },
  { file: "flow/SeminalCorpus.tsx", was: "Nothing joins your model until you accept the suggestion.", now: "A suggestion joins your ontology only when you accept it." },
  { file: "flow/CorpusMaterial.tsx", was: "Your claims cite this data.", now: "Add your transcripts, fieldnotes, memos and archives. Your claims cite this data." },
  { file: "flow/CorpusMaterial.tsx", was: "Adding a file doesn't send it anywhere or read it.", now: "Adding a file doesn't send it anywhere or read it. Press Read the data in this section, or at the Early data step on Design, and Abductive suggests concepts and statements from your data." }, // M74b, ISC-665
  // Your model, rewritten at M63 (ISC-614) in the owner's terms: the "now" is the M63 sentence doing the same job.
  { file: "ui/ConceptsView.tsx", was: "Your answers and data build your model. Every check reads your model.", now: "The concepts that you define for this project, with their definitions, properties and relations." },
  { file: "ui/ConceptsView.tsx", was: "come here to accept or reject the claims Abductive suggested.", now: "Abductive suggests concepts after you save a summary at a step or read your data, and you accept, refine or reject each one." },
  { file: "ui/ConceptsView.tsx", was: "You accepted every claim here, and each claim shows its origin mark.", now: "Each claim that your project already has is a statement, with a label of its origin" }, // M75, ISC-669
  { file: "workbench/ProposalsTrayView.tsx", was: "Reject a suggestion and it stays in this tray, struck through, with your reason.", now: "Reject a suggestion and it stays under Suggestions to review, struck through, with your reason." },
  { file: "workbench/ProposalsTrayView.tsx", was: "Whatever you change, Abductive records the claim as the model's suggestion and keeps your edit beside the original.", now: "Whatever you change, Abductive records the claim as the model's suggestion and keeps your edit beside the original." },
  // Export.
  { file: "ui/StudyViews.tsx", was: "Export your project. Every file comes from History, so every file matches the screen.", now: "Export your project. Every file comes from History, so every file matches the screen." },
  { file: "ui/model/HowArrived.tsx", was: "Every file below is built from the counts here.", now: "Abductive builds every file on Export from the counts under Design history. Press a count to open History at the entries behind that count." },
  { file: "workbench/ExportBar.tsx", was: "Match a file you sent last week back to the project it came from, using the stamp printed inside that file.", now: "Match a file that you sent last week back to the project that it came from, using the stamp printed inside that file." },
  { file: "workbench/ExportBar.tsx", was: "Abductive records every export in this list, so the list survives closing the tab.", now: "Abductive records every export under Export receipt, so the list survives closing the tab." },
  // History, which every study page's help carries.
  { file: "workbench/Instrumentation.tsx", was: "History holds every event in the order it happened.", now: "History keeps every event in the order that it happened." },
  // Model access.
  { file: "auth/AuthPanel.tsx", was: "Connect a model to ask questions, suggest claims and run checks.", now: "Connect a model to ask questions and suggest claims." },
];

describe("the explanatory sentences left the pages and live in the help", () => {
  for (const m of MOVED) {
    test(`${m.file}: "${m.was.slice(0, 50)}…"`, async () => {
      expect({ file: m.file, still: (await flatSource(m.file)).includes(m.was) }).toEqual({ file: m.file, still: false });
      expect({ now: m.now, inHelp: flat(helpText()).includes(m.now) }).toEqual({ now: m.now, inHelp: true });
    });
  }

  test("M32's route-help chip is gone, with its ledes", async () => {
    expect(await Bun.file(SRC + "ui/RouteHelp.tsx").exists()).toBe(false);
    for await (const rel of new Bun.Glob("**/*.tsx").scan(SRC)) {
      const text = await Bun.file(SRC + rel).text();
      expect({ rel, chip: /\bRouteHelp\b|route-help/.test(text) }).toEqual({ rel, chip: false });
    }
  });

  test("the rail's loop figure carries no sentence; the walkthrough keeps its own", async () => {
    // M83, ISC-698: the figure carries its name as a caption, still no sentence.
    expect(await flatSource("flow/StationRail.tsx")).toContain('<StationLoop cell={cell} testIdPrefix="rail" note={false} caption={FRAMEWORK_CAPTION} />');
    expect(helpText()).toContain("Abductive uses the Qualitative Discovery Process Framework");
  });

  test("the step's own feeds line moved from its fold into Design's help", async () => {
    expect(await flatSource("flow/StationWorkspace.tsx")).not.toContain("station.feeds");
    // And the one-line description under the step's title, which moved with it.
    expect(await flatSource("flow/StationWorkspace.tsx")).not.toContain("station.blurb");
  });

  test("every study page's help carries History", () => {
    for (const tab of STUDY_TABS) expect(PAGE_HELP[tab].parts.some((p) => p === HISTORY_HELP)).toBe(true);
  });
});

/**
 * Two sentences stay on their pages, returned to the lead (escalation
 * contract): each glosses a term where a reader first meets it, which Part 5 of
 * the copy standard requires on the page (M61, ISC-585, tests/m61-glosses). The
 * Help panel carries each one as well, so a ruling to move them is a deletion.
 */
const HELD: readonly { readonly file: string; readonly gloss: string }[] = [
  { file: "flow/SeminalCorpus.tsx", gloss: "Abductive reads each paper for its expectations (what the paper leads readers to expect) and to see which conversation you're joining." },
  // M63, ISC-614: a claim is a statement in the ontology now.
  { file: "workbench/ProposalsTrayView.tsx", gloss: "A suggestion becomes a claim (a statement in your ontology) once you accept the suggestion." },
];

describe("the two gloss sentences stay on their pages, and the help carries them too", () => {
  for (const h of HELD) {
    test(`${h.file}: "${h.gloss.slice(0, 40)}…"`, async () => {
      expect((await flatSource(h.file)).includes(h.gloss)).toBe(true);
      expect(flat(helpText()).includes(h.gloss)).toBe(true);
    });
  }
});

describe("one control per page, at the top right", () => {
  test("the study header, Projects and Model access each render the control once", async () => {
    for (const rel of ["ui/AppShell.tsx", "ui/ProjectList.tsx", "auth/AuthPanel.tsx"]) {
      const text = await flatSource(rel);
      expect({ rel, n: text.split("<HelpControl").length - 1 }).toEqual({ rel, n: 1 });
    }
  });
});

type Props = { onClick?: (e: unknown) => void; onKeyDown?: (e: unknown) => void };
function props(el: Element | null): Props {
  const key = Object.keys(el ?? {}).find((k) => k.startsWith("__reactProps$"))!;
  return (el as unknown as Record<string, Props>)[key]!;
}

describe("the control opens and closes by keyboard", () => {
  async function mount(page: "design" | "studies", station?: string) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(React.createElement(HelpControl, { page, ...(station === undefined ? {} : { station }) }));
    });
    return { host, root, trigger: host.querySelector('[data-testid="page-help-open"]') as HTMLButtonElement };
  }

  test("a native button named Help for this page, marked ?, closed at first", async () => {
    const { host, root, trigger } = await mount("design", "context");
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.getAttribute("type")).toBe("button");
    expect(trigger.getAttribute("aria-label")).toBe("Help for this page");
    expect(trigger.textContent).toBe("?");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector('[data-testid="page-help-panel"]')).toBeNull();
    root.unmount();
    host.remove();
  });

  test("pressed, the panel opens with the page's help and takes focus; Escape closes it and focus returns", async () => {
    const { host, root, trigger } = await mount("design", "context");
    trigger.focus();
    await act(async () => props(trigger).onClick?.({}));
    const panel = host.querySelector('[data-testid="page-help-panel"]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.contains(document.activeElement)).toBe(true);
    /* M95c: the chat first, and the page's help folded under it, closed. */
    const fold = panel.querySelector('[data-testid="page-help-about"]') as HTMLDetailsElement;
    expect(fold.tagName).toBe("DETAILS");
    expect(fold.open).toBe(false);
    expect(fold.querySelector("summary")?.textContent).toBe("About this page");
    const chat = panel.querySelector('[data-testid="help-chat"]') as HTMLElement;
    expect(chat.compareDocumentPosition(fold) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(panel.querySelector('[data-testid="page-help-jump"]')).toBeNull();
    const text = fold.textContent ?? "";
    for (const p of PAGE_HELP.design.purpose) expect(text).toContain(p);
    // Contextual to the step you are on, and History on every study page.
    expect(text).toContain(stationById("context").blurb);
    expect(text).toContain(stationById("context").feeds);
    expect(text).toContain("History keeps every event in the order that it happened.");
    const more = fold.querySelector('[data-testid="page-help-more"]') as HTMLAnchorElement;
    expect(more.textContent).toBe("More help");
    expect(more.getAttribute("href")).toBe(walkPath(PAGE_HELP.design.screen));

    await act(async () => props(panel).onKeyDown?.({ key: "Escape", preventDefault() {}, stopPropagation() {} }));
    expect(host.querySelector('[data-testid="page-help-panel"]')).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    root.unmount();
    host.remove();
  });

  /* M95c: every sentence that left a page for the help is inside About this page. */
  test("every moved sentence sits inside a page's About this page fold", async () => {
    const folded: string[] = [];
    for (const page of HELP_PAGES) {
      const stations = page === "design" ? STATIONS.map((s) => s.id) : [undefined];
      for (const station of stations) {
        const { host, root, trigger } = await mount(page as "design" | "studies", station);
        await act(async () => props(trigger).onClick?.({}));
        folded.push(host.querySelector('[data-testid="page-help-about"]')?.textContent ?? "");
        root.unmount();
        host.remove();
      }
    }
    const all = flat(folded.join(" "));
    for (const m of MOVED) expect({ now: m.now, folded: all.includes(flat(m.now)) }).toEqual({ now: m.now, folded: true });
  });

  test("Close closes it too, and a second press of the ? toggles it shut", async () => {
    const { host, root, trigger } = await mount("studies");
    await act(async () => props(trigger).onClick?.({}));
    const close = host.querySelector('[data-testid="page-help-close"]') as HTMLButtonElement;
    expect(close.textContent).toBe("Close");
    await act(async () => props(close).onClick?.({}));
    expect(host.querySelector('[data-testid="page-help-panel"]')).toBeNull();
    await act(async () => props(trigger).onClick?.({}));
    expect(host.querySelector('[data-testid="page-help-panel"]')).not.toBeNull();
    await act(async () => props(trigger).onClick?.({}));
    expect(host.querySelector('[data-testid="page-help-panel"]')).toBeNull();
    root.unmount();
    host.remove();
  });
});
