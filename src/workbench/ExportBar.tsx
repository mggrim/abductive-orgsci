/**
 * Exports, all from one source (ISC-68, ISC-69), each one saying what it is.
 *
 * Every row below is a projection of the same ledger. Nothing here caches or
 * transforms derived state: if two exports ever disagreed it would mean one of
 * them had started holding a copy, which is the failure the single-source rule
 * exists to prevent. The one write this component makes is the `export` event
 * described below, and it is an append like every other.
 *
 * What shipped before this was seven unlabelled white pills, identical to each
 * other, wrapping six and one, over a caption that claimed a grouping of five
 * plus two that the layout did not express. Measured at 1440x806 the surface
 * stopped at y=442 and the remaining 364px was empty. Three defects in one
 * screen: a researcher could not tell what a file would contain before pressing
 * it, could not see the grouping the caption asserted, and the window was two
 * thirds unused. So each export now states three things the pill withheld:
 * what it is (its actual filename), who it is for (one line), and what it
 * contains (live counts off the ledger, not a description of them). The three
 * groups are drawn as three groups.
 *
 * The receipt is the other half. NVivo leaves one and we left none, so a
 * researcher who submitted a design in March could not later show which version
 * of it they submitted. The stamp is a digest of every event id in order: it is
 * deterministic, it changes the moment the design does, and it can be recomputed
 * from an exported ledger by anyone holding the file. That makes it checkable by
 * a reader who does not have Abductive, which a timestamp is not.
 *
 * Two things about the receipt were wrong until this pass and both are fixed
 * here rather than described.
 *
 * It was `useState`, so it did not survive a reload. Every other number on this
 * page is a projection of the ledger and this one was session memory, which
 * meant the fact that a file left the study at a given state was the only thing
 * that happened in Abductive that Abductive did not record. Each download now appends
 * an `export` event and the list below is a projection of those. This component
 * therefore does write, which the paragraph above used to deny; what it still
 * never does is hold or transform derived state, and every count on the page is
 * a function of the events it was handed.
 *
 * And the stamp lived only here, so the artefacts themselves were anonymous. A
 * memo in a co-author's inbox was a memo; nothing in it said which version of
 * the design it was a memo of, unless the researcher had also kept the separate
 * receipt file. `src/export/stamp.ts` is the shared module now and the memo, the
 * replay, the wiki index, the figure and the agent graph each carry it inside
 * them. `ledger.json` and `bundle.json` do not, and do not need to: both hold
 * the complete event array, so the stamp is recomputable from the file itself.
 *
 * The wiki directory is still the one export that needs a permission grant and
 * the only one that can be unavailable, so it names its own control.
 */

import { useMemo, useState, type ReactNode } from "react";
import { useLedger } from "../state/ledgerContext.tsx";
import type { LedgerEvent } from "../ledger/events.ts";
import type { OntologyGraph } from "../ontology/schema.ts";
import type { Chunk, StoredDocument } from "../state/chunks.ts";
import type { Project } from "../state/projects.ts";
import { downloadText, slugify } from "../export/download.ts";
import { serializeAgentGraph } from "../export/agentGraph.ts";
import { buildDiagramSvg } from "../export/diagram.ts";
import { conceptMapSvg } from "../export/conceptsExport.ts";
import { writeWikiDirectory, WikiExportUnsupportedError } from "../export/wikiDirectory.ts";
import { buildOntologyMemo } from "../export/ontologyMemo.ts";
import { buildSessionReplay } from "../export/sessionReplay.ts";
import { serializeBundle } from "../export/bundle.ts";
import { serializeLedgerExport } from "../export/ledgerJson.ts";
import { designEvents, ledgerStamp } from "../export/stamp.ts";
import { localStamp, zoneLine } from "../export/localTime.ts";
import { originDoubts } from "../ontology/originAudit.ts";
import { exportPlan, type ExportCount, type ExportRowId } from "../export/exportContains.ts";
import { EmptyState, StatusChip } from "../ui/components/index.ts";
import { countOf, formatMoment } from "../ui/format.ts";

/**
 * The stamp moved to `src/export/stamp.ts` and is re-exported here.
 *
 * It lived in this file and only the receipt aside below could reach it, which
 * is why every artefact the tool wrote left the building unidentifiable. It is
 * now a module the writers import, so the memo, the replay, the wiki index and
 * the agent graph each stamp themselves from the events they were already
 * given, and the figure inside the file cannot drift from the figure on the
 * receipt. Re-exported rather than moved outright because it is part of this
 * module's public surface and several tests read it from here.
 */
export { ledgerStamp } from "../export/stamp.ts";

/** What the file will weigh on disk, not what the string measures in code units. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * How many rows of the receipt the panel draws before the rest goes behind a
 * disclosure. Eight is what fits beside the export rows without the aside
 * becoming the taller of the two columns on a study of any age.
 */
export const RECEIPT_ON_SCREEN = 8;

/** One thing taken out of the study, and the state it was taken from. */
export interface ExportTake {
  readonly at: number;
  readonly name: string;
  readonly bytes: number;
  readonly stamp: string;
  readonly events: number;
}

/**
 * The receipt, read off the ledger (ISC-68, receipt half).
 *
 * It was `useState` in this component. Everything else on this page is a
 * projection of the ledger and this one thing was session memory, so reloading
 * /exports emptied the receipt and the single fact a researcher needs months
 * later, that this file left this study at this state of the design, was the
 * only thing that happened in Abductive that Abductive did not record. A receipt you
 * lose by pressing refresh is not a receipt.
 *
 * Oldest first, because `buildExportReceipt` reverses for display and the
 * ledger's own order is the order things happened.
 */
export function exportTakes(
  events: readonly LedgerEvent[],
  projectId: string,
): readonly ExportTake[] {
  const out: ExportTake[] = [];
  for (const event of events) {
    if (event.type !== "export" || event.projectId !== projectId) continue;
    out.push({
      at: event.ts,
      name: event.artefact,
      bytes: event.bytes,
      stamp: event.stamp,
      events: event.designEvents,
    });
  }
  return out;
}

/** The event a download appends. Built here so the shape has one author. */
export function exportEvent(input: {
  readonly projectId: string;
  readonly artefact: string;
  readonly bytes: number;
  readonly stamp: string;
  readonly designEvents: number;
  readonly now?: () => number;
  readonly newId?: () => string;
}): LedgerEvent {
  return {
    id: (input.newId ?? (() => crypto.randomUUID()))(),
    ts: (input.now ?? Date.now)(),
    // The researcher pressed the button. Nothing here is the tool's initiative,
    // and an actor of "system" would put a row in the log the researcher did
    // not cause.
    actor: "human",
    projectId: input.projectId,
    type: "export",
    artefact: input.artefact,
    bytes: input.bytes,
    stamp: input.stamp,
    designEvents: input.designEvents,
  };
}

/**
 * The receipt as a file.
 *
 * Deliberately markdown and deliberately plain: it has to be readable by a
 * co-author, a supervisor or a journal without Abductive, and the only claim it
 * makes is one anybody can check against an exported ledger.
 */
export function buildExportReceipt(input: {
  readonly title: string;
  readonly stamp: string;
  readonly events: number;
  readonly taken: readonly ExportTake[];
  readonly at: number;
}): string {
  const { title, stamp, events, taken, at } = input;
  const rows = taken
    .slice()
    .reverse()
    .map(
      (take) => `| ${localStamp(take.at)} | ${take.name} | ${take.bytes} | ${take.stamp} | ${take.events} |`,
    );
  /* M74a, ISC-663: local times, the zone named once. */
  return [
    `# Export receipt: ${title}`,
    "",
    `Exported ${localStamp(at)}. ${zoneLine(at)}`,
    `Design at the time of export: ${countOf(events, "recorded event")}, stamp \`${stamp}\`.`,
    "",
    "| Taken at | File | Bytes | Design stamp | Events |",
    "| --- | --- | --- | --- | --- |",
    ...(rows.length === 0 ? ["| (your first export is still to come) | | | | |"] : rows),
    "",
    "## What the stamp is",
    "",
    "The stamp is a fingerprint of a file, so that you can match a copy back to this",
    "project (an FNV-1a digest of every History event id, in order, leaving out the",
    "exports). Export the full history from the same project, drop the `export` rows,",
    "and recompute the stamp to check that a file above came from the state of the",
    "design recorded beside that file. A stamp that differs means the design moved",
    "between the two exports.",
    "",
    "Abductive leaves exports out of the digest deliberately. If taking a file out changed",
    "the stamp, the stamp printed inside the file that you sent last week would no longer",
    "match anything, and this table would identify none of your files. Every row in this table",
    "is also in History as an `export` event, so this file is a convenience and not",
    "the only copy of History.",
    "",
  ].join("\n");
}

interface ExportRow {
  readonly id: ExportRowId;
  readonly title: string;
  /** The name the file will actually arrive under. */
  readonly filename: string;
  /**
   * The same name with the study slug elided.
   *
   * Every filename here starts with the same slug, so printing it seven times
   * cost two lines per row (measured: 82px rows, a 1057px page at a 806px
   * window) to repeat what the row above already said. The prefix is stated
   * once, in the receipt, where a researcher checking which file they sent
   * will be looking anyway. The full name rides on the title attribute.
   */
  readonly tail: string;
  /** Who reads it and what for. One line. */
  readonly purpose: string;
  /**
   * Off the payload, never recounted here.
   *
   * The type comes from `exportContains.ts` and so does every value assigned to
   * it. A literal written at this site is how the replay row came to print the
   * ledger length beside a file holding eleven of those events.
   */
  readonly contains: readonly ExportCount[];
  readonly actionLabel: string;
  /**
   * The one filled control on this surface (M32, R7).
   *
   * Seven controls wore the outlined default and five of them said
   * "Download", so the screen offered five visually identical primaries, which
   * is the same as offering none. One is filled: the memo, because it is the
   * file a researcher takes when they are not sure which file they want, and
   * because every other row on the page is a file you go looking for by name.
   */
  readonly primary?: boolean;
  readonly run: () => void;
  readonly testId: string;
}

interface ExportGroup {
  readonly id: string;
  readonly title: string;
  readonly blurb: string;
  readonly rows: readonly ExportRow[];
}

export function ExportBar(props: {
  project: Project;
  graph: OntologyGraph;
  events: readonly LedgerEvent[];
  chunks: readonly Chunk[];
  documents: readonly StoredDocument[];
}) {
  /* The route lede that hung off this header (M32, R6) moved into the page's
   * Help control at M62 (ISC-600). */
  const { project, graph, events, chunks, documents } = props;
  const [status, setStatus] = useState<string | null>(null);
  const { appendAll } = useLedger();
  const slug = slugify(project.title);
  // Read, not remembered. See {@link exportTakes}.
  const taken = useMemo(() => exportTakes(events, project.id), [events, project.id]);
  const lastTaken = taken[taken.length - 1];

  /*
   * One build of the payloads, printed and downloaded.
   *
   * The card's finding count is the researcher's finding count (FIN-02, round
   * five). It read `findings.length` off the raw recomputed array, so with one
   * finding dismissed on /coherence with a reason the Memo card printed
   * "FINDINGS 7" against "6 open" on the Coherence tab and "6 open findings" on
   * Biases: the fourth of four surfaces stating two sizes for one population.
   *
   * Round five routed that chip through `openFindings` and left the payload
   * alone, which produced the worse defect: the card read FINDINGS 4 and the
   * memo the button beside it wrote listed six under "Outstanding", two of them
   * dismissed with reasons still on the ledger. Round six fixed the memo, the
   * wiki and the agent graph and never visited the replay row, which went on
   * printing "events 179" beside a file that says "11 dialogue events" in its
   * own first line, between two rows whose identical chip was true.
   *
   * So the counts are not computed here any more. `exportPlan` builds the wiki
   * files, the agent graph, the ledger envelope and the bundle once, reads the
   * counts off those objects, and hands back both. The buttons below download
   * the same objects the chips were counted from, which is why a row can no
   * longer describe a file it does not write. See `src/export/exportContains.ts`.
   */
  const plan = useMemo(
    () => exportPlan({ project, graph, events, chunks, documents }),
    [project, graph, events, chunks, documents],
  );
  const { wikiFiles, contains } = plan;

  const stamp = useMemo(() => ledgerStamp(events), [events]);
  // What the stamp was taken over. Not `events.length`: the exports are on the
  // ledger now and the stamp deliberately skips them, so reporting the raw
  // length beside the digest would report a count the digest does not describe
  // and the number would tick up every time the researcher pressed a button
  // without the stamp moving.
  const designCount = useMemo(() => designEvents(events).length, [events]);

  /**
   * Record what left, then say so.
   *
   * The append is fire-and-forget on purpose. Nothing gates: the file has
   * already reached the researcher's disk by the time this runs, and making the
   * download await a write would put an IndexedDB round trip between pressing a
   * button and getting the file, to no end. A failed append is reported in the
   * status line rather than swallowed, because a receipt that silently did not
   * record is worse than one that says it did not.
   */
  function record(name: string, bytes: number, said: string) {
    setStatus(said);
    void appendAll([
      exportEvent({
        projectId: project.id,
        artefact: name,
        bytes,
        stamp,
        designEvents: designCount,
      }),
    ]).catch((err: unknown) => {
      setStatus(
        `${said} Abductive couldn't save the receipt to History: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  }

  function deliver(filename: string, text: string, mime: string, said: string) {
    downloadText(filename, text, mime);
    record(filename, byteLength(text), said);
  }

  const exportMemo = () =>
    deliver(
      `${slug}-report.md`,
      buildOntologyMemo({ project, graph, events, labels: { chunks, documents } }),
      "text/markdown",
      "Report exported.",
    );

  /* The figure is handed the same reading of the ledger the memo is.
   *
   * `buildOntologyMemo` and `buildAgentGraph` take the events and run
   * `originDoubts` themselves; `buildDiagramSvg` takes a graph and no events,
   * and for three rounds that meant the one export that goes into a paper was
   * the one export with no access to the doubt at all. A reviewer holding
   * memo.md next to ontology.svg found the two files disagreeing about who
   * wrote a page, which is the single comparison ATLAS.ti wins against us: its
   * provenance channel is too coarse to say "yours" about something a model
   * wrote, and ours was fine enough to say it and did. */
  const doubted = useMemo(
    () => new Set(originDoubts(events, project.id).keys()),
    [events, project.id],
  );

  /* M63, ISC-613: the figure draws the concept map, from the layout the tab
     draws. A project with no accepted concept keeps the claims figure. */
  const exportDiagram = () => {
    const map = conceptMapSvg(events, project.id, graph, { title: project.title, stamp });
    deliver(
      map === null ? `${slug}-ontology.svg` : `${slug}-concept-map.svg`,
      map ?? buildDiagramSvg(graph, { title: project.title, stamp, doubted }),
      "image/svg+xml",
      "Diagram exported.",
    );
  };

  // `plan.agentGraph`, not a second build of it. The chips above this button
  // counted that object, so serialising anything else would let the row and the
  // file drift apart again by one refactor.
  const exportAgentGraph = () =>
    deliver(
      `${slug}-ontology.json`,
      serializeAgentGraph(plan.agentGraph),
      "application/json",
      "Graph exported. The file records each claim's origin, the parts that your ontology can't explain yet, and the paths that you rejected.",
    );

  /* Through `src/export/ledgerJson.ts`, which until this pass no caller
   * reached.
   *
   * The line here was `JSON.stringify(events, null, 2)`, so the shipped file
   * was a bare array with no format tag, no version and no event count, while
   * the module written to build the envelope sat unimported beside the other
   * six writers. Two costs, and the second is the one that bit. A reader
   * holding the file could not tell what it was, and every test and every
   * comment that named `ledgerJson.ts` as the place the ledger export happens
   * was pointing at code that did not run. `recordJson.ts` now escapes the
   * banned dash on the way out of that module, and routing through it is what
   * makes that reach the download. */
  const exportLedger = () =>
    deliver(
      `${slug}-ledger.json`,
      // The envelope the chip counted, with the hour it actually left. The
      // events and the count are the plan's; only `exportedAt` is press time,
      // because a file that says it was taken when the tab was opened is
      // wrong about the one thing a timestamp is for.
      serializeLedgerExport({ ...plan.ledger, exportedAt: Date.now() }),
      "application/json",
      `History exported: ${countOf(plan.ledger.eventCount, "event")}.`,
    );

  const exportReplay = () =>
    deliver(
      `${slug}-replay.md`,
      buildSessionReplay({ project, events }),
      "text/markdown",
      // The number the row prints, said again on the way out. Both are
      // `replayDialogue`, which is what the file counts in its first line.
      `Session replay exported: ${countOf(plan.dialogue.length, "dialogue event")}.`,
    );

  const exportBundleFile = () =>
    // The re-importable one. Carries documents and chunks as well as the
    // ledger, so a co-author opens the project rather than a reading of it.
    // `plan.bundle` for the same reason the agent graph is.
    deliver(
      `${slug}-bundle.json`,
      serializeBundle(plan.bundle),
      "application/json",
      "Bundle exported. A co-author can open the bundle in Abductive, and the bundle carries your sources too.",
    );

  const exportWiki = async () => {
    try {
      const written = await writeWikiDirectory(wikiFiles);
      const bytes = wikiFiles.reduce((sum, file) => sum + byteLength(file.content), 0);
      record(`${slug}-wiki/`, bytes, `Wiki exported: ${written} files. Open index.md.`);
    } catch (err) {
      if (err instanceof WikiExportUnsupportedError) {
        setStatus(err.message);
        return;
      }
      // An abort is the user closing the picker, not a failure worth shouting about.
      if (err instanceof DOMException && err.name === "AbortError") {
        setStatus(null);
        return;
      }
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  const takeReceipt = () => {
    const text = buildExportReceipt({
      title: project.title,
      stamp,
      events: designCount,
      taken,
      at: Date.now(),
    });
    // Through `deliver`, so the receipt is itself recorded as an export. It
    // lists the files taken before it and not itself, which is the honest shape:
    // a receipt cannot contain its own row, and the ledger is where the complete
    // list lives.
    deliver(
      `${slug}-export-receipt.md`,
      text,
      "text/markdown",
      `Receipt exported: ${countOf(taken.length, "file")} listed.`,
    );
  };

  /*
   * The receipt on screen is bounded; the receipt as a file is not.
   *
   * `RECEIPT_ON_SCREEN` rows answer the question the panel is for, which is
   * "what did I last send and at what stamp". Everything older is a disclosure
   * away and all of it is in the downloadable table, so nothing is hidden and
   * nothing is lost.
   */
  const newestFirst = useMemo(() => taken.slice().reverse(), [taken]);
  const recent = newestFirst.slice(0, RECEIPT_ON_SCREEN);
  const earlier = newestFirst.slice(RECEIPT_ON_SCREEN);
  const takeRow = (take: ExportTake) => (
    <li key={`${take.at}-${take.name}`}>
      <code className="export-file">{take.name}</code>
      {/* formatMoment, not formatClock. This list survives closing the tab,
          which is the property the panel above it advertises, so a row read a
          week later said "21:36" and named no day. Every other time in the app
          is a moment: "Last run today at 17:19" on Coherence, "Last written"
          two lines up, "touched 5 August 2026" on /studies. */}
      <span className="small muted">
        {formatMoment(take.at)} · {formatBytes(take.bytes)} · {take.stamp}
      </span>
    </li>
  );

  const groups: readonly ExportGroup[] = [
    {
      id: "read",
      title: "View and share",
      blurb: "Your design as it stands, in a form that a person can open.",
      rows: [
        {
          id: "memo",
          title: "Report",
          filename: `${slug}-report.md`,
          tail: "…-report.md",
          purpose: "A written account of your design, for a co-author or a methods section.",
          contains: contains.memo,
          actionLabel: "Export",
          primary: true,
          run: exportMemo,
          testId: "export-memo",
        },
        {
          id: "diagram",
          title: "Diagram",
          filename: `${slug}-ontology.svg`,
          tail: "…-ontology.svg",
          purpose: "Your ontology as one picture, for a slide or a figure in the paper.",
          contains: contains.diagram,
          actionLabel: "Export",
          run: exportDiagram,
          testId: "export-diagram",
        },
        {
          id: "wiki",
          title: "Wiki",
          filename: `${slug}-wiki/`,
          tail: "…-wiki/",
          purpose:
            "One linked file per claim, for browsing in a repository or a notes app. You choose the folder.",
          contains: contains.wiki,
          actionLabel: "Choose folder",
          run: () => void exportWiki(),
          testId: "export-wiki",
        },
      ],
    },
    {
      id: "machine",
      title: "Use in other tools",
      blurb: "Machine-readable. Both files record the author of each claim and each link, so another tool can open your ontology without rebuilding it.",
      rows: [
        {
          id: "agent-graph",
          title: "Graph",
          filename: `${slug}-ontology.json`,
          tail: "…-ontology.json",
          purpose:
            "Your claims, what they can't explain yet, and the paths that you rejected, for a model or another tool.",
          contains: contains["agent-graph"],
          actionLabel: "Export",
          run: exportAgentGraph,
          testId: "export-agent-graph",
        },
        {
          id: "ledger",
          /* ProseCodex batch 2, item 71: an on-screen rename only. The glossary
             maps ledger to "the record", and this is the row a researcher
             reads. The file is still `{slug}-ledger.json`, the id, the code and
             the existing gloss keep the word, because renaming those is a
             product decision owed by every other surface that says ledger. */
          title: "Full history",
          filename: `${slug}-ledger.json`,
          tail: "…-ledger.json",
          purpose: "Every event in the order that it happened, for an auditor or a replication.",
          contains: contains.ledger,
          actionLabel: "Export",
          run: exportLedger,
          testId: "export-ledger",
        },
      ],
    },
    {
      id: "session",
      title: "Hand over the project",
      blurb: "These two files carry how you reached your design and the design itself.",
      rows: [
        {
          id: "replay",
          title: "Session replay",
          filename: `${slug}-replay.md`,
          tail: "…-replay.md",
          purpose:
            "Your session question by question, for a reader who wants your route to the design.",
          contains: contains.replay,
          actionLabel: "Export",
          run: exportReplay,
          testId: "export-replay",
        },
        {
          id: "bundle",
          title: "Project bundle",
          filename: `${slug}-bundle.json`,
          tail: "…-bundle.json",
          /* M78a, ISC-680: the "rather than" reframe went (REFRAME). */
          purpose: "The whole project, including your sources, for a co-author to open in Abductive.",
          contains: contains.bundle,
          actionLabel: "Export",
          run: exportBundleFile,
          testId: "export-bundle",
        },
      ],
    },
  ];

  return (
    /* M32, R5. The panel grammar, and this surface is its reference
       implementation: the critique measured it as already 80% of the shape
       every study route now takes, a list of files on the left and the receipt
       on the right. What it gained is the two panes' own scroll and their
       sticky sub-headers; the layout itself moved to panels.css so that one
       grammar is declared once rather than restated per surface. */
    <section
      className="exports panel-frame"
      data-panels="main-side"
      data-testid="export-bar"
    >
      <div className="export-groups panel-main">
        <div className="panel-body">
          {groups.map((group) => (
            <section
              className="export-group"
              key={group.id}
              data-testid={`export-group-${group.id}`}
            >
              <h2 className="export-group-title">{group.title}</h2>
              <p className="export-group-blurb">{group.blurb}</p>
              <ul className="export-list">
                {group.rows.map((row) => (
                  <li className="export-row" key={row.id}>
                    <div className="export-what">
                      <span className="export-name">{row.title}</span>
                      <code className="export-file" title={row.filename}>
                        {row.tail}
                      </code>
                    </div>
                    <p className="export-purpose">{row.purpose}</p>
                    <div className="export-contains">
                      {row.contains.map((count) => (
                        /* M29b. The split rides in the label when the number on
                           this tab and the number on Material count different
                           things, so a reader comparing the two is told which. */
                        <StatusChip
                          key={count.label}
                          label={
                            count.note === undefined ? count.label : `${count.label} (${count.note})`
                          }
                          count={count.count}
                        />
                      ))}
                    </div>
                    <div className="export-do">
                      <button
                        type="button"
                        className={row.primary === true ? "primary" : undefined}
                        onClick={row.run}
                        data-testid={row.testId}
                      >
                        {row.actionLabel}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>

      <aside className="export-receipt panel-side" data-testid="export-receipt">
        <div className="panel-head">
          {/* The one place --text-micro earns a heading rather than a label:
              it is still the region's h2, and the register says "this names a
              pane" rather than "this opens a section". */}
          <h2 className="export-receipt-title panel-title">Export receipt</h2>
        </div>
        <div className="panel-body">
          <dl className="export-stamp">
            <dt>Filenames</dt>
            <dd>
              <code>{slug}-…</code>
            </dd>
            {/* The design, not the raw ledger length. Exports are on the ledger
                now and the stamp skips them, so printing `events.length` here
                would put a number beside a digest that does not describe it, and
                the number would climb on every download while the digest held
                still. */}
            {/* "of N in the ledger" is the coherence fix, and the number it
                reconciles is 60cm away on the same screen. The Full ledger row
                above reads "events 60" and this line read "52 recorded events",
                two counts of one word with nothing joining them; the note below
                explains why the stamp skips exports but never says that is where
                the eight went. The term is also "Design events" rather than
                "Design", which read as a link to the Design tab. */}
            <dt>Events</dt>
            <dd>
              {countOf(designCount, "recorded event")}, of {events.length} in History
            </dd>
            <dt>Stamp</dt>
            <dd>
              <code data-testid="export-stamp">{stamp}</code>
            </dd>
            {/* M74a, ISC-663 (the walk, finding 17): "Last exported" named the
                design's last change, so it read "today at 15:35" above "No
                exports yet." It names the last file that went out, and only once
                one has. */}
            {lastTaken !== undefined && (
              <>
                <dt>Last exported</dt>
                <dd>{formatMoment(lastTaken.at)}</dd>
              </>
            )}
          </dl>
          {/* M28: copy. Five sentences about the digest, none of them about
              what the reader gets from it. The mechanics of the stamp live in
              src/export/stamp.ts and in the receipt file's own "What the stamp
              is" section, which is where somebody checking a file will look. */}
          <p className="export-receipt-note">
            You're seeing the most recent exports, and the receipt file lists all of them.
          </p>
          {taken.length === 0 ? (
            <EmptyState
              status="You haven't exported a file yet."
              teach="Export any file above and the file appears in this list with its size and its stamp at the time of export."
              testId="export-receipt-empty"
            />
          ) : (
            <>
              <ol className="export-taken" data-testid="export-taken">
                {recent.map(takeRow)}
              </ol>
              {/* The rest, behind a disclosure and inside a bounded box.
               *
               * This list had no cap. Measured at 1440 on a two-day-old fixture:
               * 123 rows, the aside 304x7651 beside 888x658 of exports, nine
               * screens of a filename column next to an empty canvas. It also
               * grows every time the researcher presses a button on this very
               * page, so the surface got worse the more it was used, which is the
               * one direction a receipt must not go.
               *
               * Both incumbents keep bulk out of the layout: an ATLAS.ti report is
               * a spreadsheet and neither product paints its export history into
               * the page at all. The same discipline was already in this file, one
               * function up: `buildExportReceipt` writes all of it as a 106-row
               * markdown table that a co-author can open without Abductive. So the
               * screen shows the last few, the disclosure holds the remainder in
               * its own scroll region rather than in the page's, and the file
               * stays the complete record. */}
              {earlier.length > 0 && (
                <details className="export-taken-more" data-testid="export-taken-more">
                  <summary>
                    {countOf(earlier.length, "earlier file")}, oldest last
                  </summary>
                  <ol className="export-taken">{earlier.map(takeRow)}</ol>
                </details>
              )}
              <div className="btnrow">
                <button type="button" onClick={takeReceipt} data-testid="export-receipt-file">
                  Export receipt
                </button>
              </div>
            </>
          )}
          {status !== null && (
            <p className="small" data-testid="export-status" role="status">
              {status}
            </p>
          )}
        </div>
      </aside>
    </section>
  );
}
