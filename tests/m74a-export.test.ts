/**
 * M74a, ISC-663: Export, the Report, field lines and provenance (the walk of
 * 2026-10-02, findings 14 and 17, and the fixed strings under the rules).
 *
 * The walk read "Last exported today at 15:35" above "You haven't exported a file yet.", a
 * filename that dropped the é, "Written 2026-10-02 13:35" in UTC beside a screen
 * reading 15:35, a stamp explained as "an FNV-1a digest", outstanding flags by
 * id with the quoted answer lower-cased, a closing line saying the report's
 * contradictions were deliberate, eight field lines in one template still
 * naming a concept by the name it had before the student refined it, and the
 * refined concept "Written by: forced by the data."
 */

import { afterAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import type { LedgerEvent } from "../src/ledger/events.ts";
import type { Project } from "../src/state/projects.ts";
import { slugify } from "../src/export/download.ts";
import { stampLine } from "../src/export/stamp.ts";
import { localStamp, zoneLine } from "../src/export/localTime.ts";
import { buildOntologyMemo } from "../src/export/ontologyMemo.ts";
import { conceptReportLines } from "../src/export/conceptsExport.ts";
import { buildExportReceipt, ExportBar, exportTakes } from "../src/workbench/ExportBar.tsx";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { asQuestion, projectConcepts } from "../src/concepts/projection.ts";
import { conceptMarkLabel, conceptWrittenLine } from "../src/ui/originVocabulary.ts";
import { homedLine } from "../src/ui/ConceptsView.tsx";

const WALK = (await Bun.file(new URL("./fixtures/m72-walk.json", import.meta.url)).json()) as {
  project: Project;
  events: LedgerEvent[];
};
const WP = WALK.project.id;
const before = process.env.TZ;
process.env.TZ = "Europe/Paris";
afterAll(() => {
  if (before === undefined) delete process.env.TZ;
  else process.env.TZ = before;
});

/** The walk's report, 13:35 UTC on 2 October 2026, 15:35 in Paris. */
const REPORT_TS = (WALK.events.find((e) => e.type === "readiness-report") as LedgerEvent).ts;
const graph = projectOntology(WALK.events, WP);
const memo = buildOntologyMemo({ project: WALK.project, graph, events: WALK.events, now: () => REPORT_TS + 60_000 });

describe("the receipt before the first export", () => {
  test("no Last exported line until a file has gone out", () => {
    const design = WALK.events.filter((e) => e.type !== "export");
    const render = (events: readonly LedgerEvent[]) =>
      renderToStaticMarkup(
        createElement(
          LedgerProvider as never,
          { store: new InMemoryLedgerStore() } as never,
          createElement(ExportBar, { project: WALK.project, graph, events, chunks: [], documents: [] }),
        ),
      );
    const none = render(design);
    expect(none).toContain("exported a file yet."); // M75: L21
    expect(none).not.toContain("Last exported");
    const one = render(WALK.events);
    expect(one).toContain("Last exported");
    expect(one).toContain(localStamp(exportTakes(WALK.events, WP)[0]!.at).slice(11));
  });
});

describe("filenames keep accented letters", () => {
  test("café stays café, normalised to NFC, with only unsafe characters replaced", () => {
    expect(slugify(WALK.project.title)).toBe("repair-café-what-s-worth-fixing-example-walk");
    expect(slugify("Repair cafe\u0301")).toBe("repair-café");
    expect(slugify("Ølstue / Zürich: ¿por qué?")).toBe("ølstue-zürich-por-qué");
    expect(slugify("???")).toBe("project");
  });
});

describe("times in the researcher's zone, named once", () => {
  test("the Report's time is local, and the zone is named once at the top", () => {
    /* M89: the Report's own line carries the time now. The readiness report's
     * "Written 15:35." went with the report; the walk's recorded
     * `readiness-report` event stays in the ledger and still fixes the clock. */
    expect(localStamp(REPORT_TS)).toBe("2026-10-02 15:35");
    expect(memo).toContain("from your project's History on 2026-10-02 15:36.");
    expect(memo).not.toContain("13:36");
    expect(memo.split("Europe/Paris").length - 1).toBe(1);
    expect(zoneLine(REPORT_TS)).toContain("Europe/Paris (UTC+02:00)");
  });

  test("the receipt file prints local times with the zone named once", () => {
    const taken = exportTakes(WALK.events, WP);
    const file = buildExportReceipt({ title: WALK.project.title, stamp: "5e5143f2", events: 243, taken, at: REPORT_TS + 120_000 });
    expect(file).not.toMatch(/\d{4}-\d\d-\d\dT\d\d:\d\d/);
    expect(file).toContain(`| ${localStamp(taken[0]!.at)} |`);
    expect(file.split("Europe/Paris").length - 1).toBe(1);
  });
});

describe("the stamp, explained in plain words", () => {
  test("what it is for comes first, and the technical name in a parenthesis after it", () => {
    const line = stampLine(WALK.events);
    expect(line).toContain("a fingerprint of this file, so that you can match a copy back to this project (an FNV-1a digest");
    expect(line.indexOf("fingerprint")).toBeLessThan(line.indexOf("FNV-1a"));
    const receipt = buildExportReceipt({ title: "t", stamp: "s", events: 1, taken: [], at: REPORT_TS });
    expect(receipt.indexOf("fingerprint")).toBeLessThan(receipt.indexOf("FNV-1a"));
  });
});

describe("the Report's close", () => {
  test("the report closes on one affirmative sentence", () => {
    expect(memo.trimEnd().endsWith("_This report describes a design that is still changing._")).toBe(true);
    expect(memo).not.toContain("not a finding");
  });

  test("suggestions to decide on are said with you as the agent", () => {
    const lines = conceptReportLines(WALK.events, WP, graph).join("\n");
    expect(lines).toContain("_You have 17 suggested concepts to decide on._");
    expect(lines).toContain("_You have five suggested relations to decide on._");
    expect(lines).not.toMatch(/wait for your decision/);
  });
});

describe("field lines and provenance (finding 14)", () => {
  const view = projectConcepts(WALK.events, WP, graph);
  const lines = view.lookFor.map((l) => l.text);

  test("a refined concept's lines use its refined name", () => {
    expect(lines.join(" ")).not.toContain("cases of Arguing about it.");
    expect(lines).toContain("In each case of Arguing about whether it's worth it, who argues?");
  });

  test("a line varies with the property it comes from", () => {
    expect(lines).toContain("In each case of Money argument, what is the argument about?");
    expect(lines).toContain("In each case of Money argument, which volunteers take part?");
    expect(lines).toContain("In each case of Money argument, how does it end?");
    expect(lines).toContain("Across your cases of Bike table, compare the things people bring.");
    expect(lines.filter((l) => l.startsWith("Watch for variation in")).length).toBe(0);
  });

  test("a property phrased as a wh-clause becomes a question that is grammatical", () => {
    expect(asQuestion("How often it happens")).toBe("how often does it happen?");
    expect(asQuestion("how many volunteers argue")).toBe("how many volunteers argue?");
    expect(asQuestion("how much it costs")).toBe("how much does it cost?");
    expect(asQuestion("why people bother")).toBe("why do people bother?");
    expect(asQuestion("what the argument is about")).toBe("what is the argument about?");
    expect(asQuestion("the things people bring")).toBeNull();
  });

  test("a refined concept carries the mark refined by you, and the Report says Written by Abductive, refined by you", () => {
    const refined = view.accepted.find((c) => c.name === "Arguing about whether it's worth it")!;
    expect(refined.original).not.toBeNull();
    expect(conceptMarkLabel(refined.origin!, true)).toBe("from the data, refined by you");
    expect(conceptMarkLabel("author-prior", true)).toBe("yours");
    expect(conceptWrittenLine(refined.origin!, true)).toBe("Written by Abductive, refined by you");
    const report = conceptReportLines(WALK.events, WP, graph).join("\n");
    expect(report).toContain("_Written by Abductive, refined by you._");
    expect(report).not.toContain("forced by the data");
  });

  test("one suggested statement has its home, and several have theirs", () => {
    expect(homedLine(1, "relation")).toBe("One suggested statement has this relation as its proposed home.");
    expect(homedLine(3, "relation")).toBe("Three suggested statements have this relation as their proposed home.");
    expect(homedLine(1, "concept")).toBe("One suggested statement has this concept as its proposed home.");
  });
});

describe("the Report's files are in the scan's reach (the fixed strings under the rules)", () => {
  test("no L17 act and no X-not-Y reframe in the files a Report, a wiki or a replay is written from", async () => {
    const { reportReachOffenders } = await import("./copyBarScan.ts");
    expect(await reportReachOffenders()).toEqual([]);
  });

  test("the pattern catches the strings the walk read", async () => {
    const { THINGS_ACT, APPOSITIVE_NOT } = await import("./copyBarScan.ts");
    expect(THINGS_ACT.test("17 suggested concepts wait for your decision.")).toBe(true);
    expect(APPOSITIVE_NOT.test("This is a design in progress, not a finding.")).toBe(true);
  });
});
