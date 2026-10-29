/**
 * The ledger panel (INS wave).
 *
 * The append-only ledger is the product's central claim and there was no view
 * of it inside the tool. What stood in its place, `views/Timeline.tsx`, printed
 * the stored value of every field: the actor as "human" and "system", the topic
 * as "station:context", the boundary subject as "context:not-applicable", and
 * whatever id the event happened to carry in place of the object it acted on.
 *
 * These are the pure halves. The live halves are Interceptor probes on the
 * running app, and keeping the projection separately testable is what makes the
 * browser pass a check on rendering rather than on arithmetic.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import type { LedgerEvent } from "../src/ledger/events.ts";
import {
  Instrumentation,
  LEDGER_FAMILIES,
  LEDGER_KINDS,
  LedgerView,
  actorLabel,
  projectLedger,
  spineLabel,
  type LedgerRow,
} from "../src/workbench/Instrumentation.tsx";
import { STATIONS } from "../src/flow/stations.ts";
import { MATRIX } from "../src/matrix/matrix.ts";

const PROJECT = "proj-ledger";
let clock = 2_200_000_000_000;

function env(actor: "human" | "system" | `persona:${string}` = "system") {
  clock += 60_000;
  const base = { id: crypto.randomUUID(), ts: clock, actor, projectId: PROJECT };
  return actor.startsWith("persona:")
    ? { ...base, model: "claude-sonnet-5", modelVersion: "claude-sonnet-5" }
    : base;
}

function ask(topic: string, station?: string): LedgerEvent {
  return {
    ...env("system"),
    type: "question-selection",
    moveId: `${topic}@0`,
    topic,
    question: `What about ${topic}?`,
    alternatives: [],
    mode: "interrogation",
    reason: "because it is next",
    ...(station === undefined ? {} : { station }),
  } as LedgerEvent;
}

const row = (rows: readonly LedgerRow[], id: string): LedgerRow => {
  const found = rows.find((r) => r.id === id);
  if (found === undefined) throw new Error(`no row for ${id}`);
  return found;
};

describe("the ledger projection", () => {
  test("one row per event, in append order, nothing dropped", () => {
    // The ledger is append-only and the view is a projection of it. A filter
    // that dropped a kind it had no case for would be a silent hole in the one
    // surface an outside auditor reads.
    const events: LedgerEvent[] = [
      { ...env("human"), type: "bound", subject: "site", statement: "One ward." },
      ask("puzzle:root"),
      { ...env("human"), type: "response", text: "The handoff." },
      { ...env("system"), type: "saturation-check", mutationsInWindow: 0, windowTurns: 5, reached: false },
    ] as LedgerEvent[];
    const rows = projectLedger(events);
    expect(rows.map((r) => r.kind)).toEqual([
      "bound",
      "question-selection",
      "response",
      "saturation-check",
    ]);
    expect(rows.map((r) => r.id)).toEqual(events.map((e) => e.id));
  });

  test("every event kind produces a non-empty summary and object", () => {
    // The switch in describeEvent is exhaustive by type, which the compiler
    // holds. What it cannot hold is that a branch returns something worth
    // reading, and an empty cell in a fixed grid reads as a rendering failure.
    const question = ask("station:site", "site");
    const challenge = {
      ...env("persona:eisenhardt"),
      type: "challenge",
      text: "One ward cannot carry the comparison.",
      matrixCell: "confirmation:site-sample",
    } as LedgerEvent;
    const finding = {
      ...env("system"),
      type: "lint-finding",
      rule: "orphan-construct",
      targetKind: "page",
      targetId: "p1",
      reason: "Nothing grounds this page.",
    } as LedgerEvent;
    const proposal = {
      ...env("persona:extractor"),
      type: "proposal",
      proposalId: "prop-1",
      pageType: "observation",
      title: "Label drift at handoff",
      sourceChunks: [],
    } as LedgerEvent;

    const events: LedgerEvent[] = [
      { ...env("human"), type: "bound", subject: "site:not-yet", statement: "Deferred." },
      challenge,
      { ...env("system"), type: "flag", matrixCell: "confirmation:site-sample", reason: "Fired." },
      { ...env("system"), type: "attention", layer: "retrieval", chunkId: "chunk-aaaaaaaaaa" },
      question,
      { ...env("human"), type: "response", text: "Yes.", inReplyTo: question.id },
      {
        ...env("human"),
        type: "adjudication",
        verdict: "reject",
        challengeId: challenge.id,
        reason: "Not the comparison I am making.",
      },
      { ...env("human"), type: "reveal", subject: "modal-twin", via: "on-demand" },
      {
        ...env("human"),
        type: "ontology-mutation",
        op: "create",
        targetId: "p1",
        pageType: "puzzle",
        origin: "author-prior",
        title: "Why nobody treats drift as a problem",
      },
      proposal,
      {
        ...env("human"),
        type: "proposal-adjudication",
        proposalId: "prop-1",
        disposition: "reject",
        reason: "Already have it.",
      },
      { ...env("human"), type: "redirection", toTopic: "station:sample" },
      { ...env("human"), type: "refusal", questionEventId: question.id, kind: "not-now" },
      { ...env("system"), type: "saturation-check", mutationsInWindow: 1, windowTurns: 5, reached: false },
      {
        ...env("human"),
        type: "puzzle-collapse",
        keptPuzzleIds: ["p1"],
        supersededPuzzleIds: ["p2"],
        reason: "One puzzle carries it.",
      },
      finding,
      {
        ...env("human"),
        type: "finding-disposition",
        findingId: finding.id,
        disposition: "acknowledged",
      },
    ] as LedgerEvent[];

    const rows = projectLedger(events);
    // Vacuity guard: every kind in the union is exercised here, so a branch
    // added later without a case fails this rather than shipping blank.
    expect(new Set(rows.map((r) => r.kind)).size).toBe(17);
    for (const r of rows) {
      expect(`${r.kind} happened: ${r.happened.trim() === "" ? "EMPTY" : "ok"}`).toBe(
        `${r.kind} happened: ok`,
      );
      expect(`${r.kind} changed: ${r.changed.trim() === "" ? "EMPTY" : "ok"}`).toBe(
        `${r.kind} changed: ok`,
      );
    }
  });

  test("the object column resolves the id the event carried (ISC-26)", () => {
    // The whole difference between an audit trail and a debug dump. An
    // adjudication stores a challenge id, a proposal decision stores a proposal
    // id and a finding decision stores a finding id; none of the three is what
    // was acted on, and the old view printed all three.
    const challenge = {
      ...env("persona:eisenhardt"),
      type: "challenge",
      text: "Too few sites.",
      matrixCell: "confirmation:site-sample",
    } as LedgerEvent;
    const finding = {
      ...env("system"),
      type: "lint-finding",
      rule: "orphan-construct",
      targetKind: "page",
      targetId: "p9",
      reason: "Nothing grounds it.",
    } as LedgerEvent;
    const events: LedgerEvent[] = [
      challenge,
      { ...env("human"), type: "adjudication", verdict: "accept", challengeId: challenge.id },
      {
        ...env("persona:extractor"),
        type: "proposal",
        proposalId: "prop-7",
        pageType: "rival",
        title: "Shift length, not handoff",
        sourceChunks: [],
      },
      { ...env("human"), type: "proposal-adjudication", proposalId: "prop-7", disposition: "accept" },
      finding,
      {
        ...env("human"),
        type: "finding-disposition",
        findingId: finding.id,
        disposition: "not-applicable",
        reason: "Deliberate.",
      },
    ] as LedgerEvent[];
    const rows = projectLedger(events);
    const changed = new Map(rows.map((r) => [r.kind, r.changed]));
    // The cell, in the glossary's words, rather than "challenge 3f8a1c02".
    expect(changed.get("adjudication")).toContain("confirmation");
    expect(changed.get("adjudication")).not.toContain(challenge.id.slice(0, 8));
    // The proposal's title, rather than "prop-7".
    expect(changed.get("proposal-adjudication")).toBe("Shift length, not handoff");
    // The rule, rather than the finding's uuid.
    expect(changed.get("finding-disposition")).toBe("orphan-construct");
  });

  test("no routing key reaches the object column (ISC-265)", () => {
    // `interview/topicLabel.ts` exists because the tool was printing its own
    // interior vocabulary at the researcher. The ledger was doing it in five
    // shapes at once: station:context, cell:confirmation:design-brief,
    // lint:orphan-construct:b19b3f86, and the two declination subjects
    // context:not-yet and context:not-applicable.
    const events: LedgerEvent[] = [
      ask("station:context", "context"),
      { ...env("human"), type: "redirection", toTopic: "puzzle:root" },
      { ...env("human"), type: "bound", subject: "context:not-applicable", statement: "No." },
      { ...env("human"), type: "bound", subject: "context:not-yet", statement: "Later." },
      { ...env("human"), type: "bound", subject: "research-question", statement: "How does it drift?" },
      { ...env("system"), type: "flag", matrixCell: "confirmation:design-brief", reason: "Fired." },
    ] as LedgerEvent[];
    const rows = projectLedger(events);
    const changed = rows.map((r) => r.changed);
    expect(changed).toEqual([
      // M42: a station topic names the step, and the declination reads the way
      // the control the researcher pressed reads.
      "the Context step",
      "the thing that you can't account for",
      "Context, doesn't apply to this project",
      "Context, set aside for now",
      "research question",
      "confirmation at the starting point",
    ]);
    // And the guard that keeps it: no colon-joined slug anywhere in the column.
    for (const value of changed) {
      expect(`${value}: ${/^[a-z0-9-]+:[a-z0-9:-]+$/.test(value) ? "slug" : "words"}`).toBe(
        `${value}: words`,
      );
    }
  });

  test("the actor is said, not spelled", () => {
    // "human" and "system" are stored values. The panel an outside auditor
    // reads addressed the researcher by the first of them.
    expect(actorLabel("human")).toBe("you");
    expect(actorLabel("system")).toBe("Abductive");
    // M42 gave each role a hat ("Abductive, suggesting claims") and read a creed
    // from the bias grid as "Abductive, as eisenhardt". M74a (ISC-662, the walk
    // of 2026-10-02): the Who filter offered persona ids a student can't place,
    // so every persona reads as Abductive.
    expect(actorLabel("persona:drafter")).toBe("Abductive");
    expect(actorLabel("persona:eisenhardt")).toBe("Abductive");
    // The raw value survives on the row, because the Who filter matches on it.
    const events = [ask("puzzle:root")] as LedgerEvent[];
    expect(projectLedger(events)[0]?.actor).toBe("system");
    expect(projectLedger(events)[0]?.who).toBe("Abductive");
  });
});

describe("station attribution", () => {
  test("an answer and a refusal inherit the station of their question", () => {
    // The same inheritance Dialogue.turnsAtStation uses, and it has to be:
    // only question-selection carries a station, so without it every answer in
    // the study reads as belonging to nowhere.
    const question = ask("station:site", "site");
    const events: LedgerEvent[] = [
      question,
      { ...env("human"), type: "response", text: "One ward.", inReplyTo: question.id },
      { ...env("human"), type: "refusal", questionEventId: question.id, kind: "dont-know" },
    ] as LedgerEvent[];
    const rows = projectLedger(events);
    expect(rows.map((r) => r.station)).toEqual(["site", "site", "site"]);
  });

  test("an event with no question of its own takes the station in force", () => {
    const events: LedgerEvent[] = [
      ask("station:process", "process"),
      { ...env("system"), type: "flag", matrixCell: "confirmation:design-brief", reason: "Fired." },
    ] as LedgerEvent[];
    expect(projectLedger(events)[1]?.station).toBe("process");
  });

  test("events before any station belong to the study, not to a guess", () => {
    // Studies that predate M26 have turns with no station and a ledger does not
    // rewrite its own history. Attributing them to the first station that later
    // appeared would be inventing record.
    const events: LedgerEvent[] = [
      { ...env("human"), type: "bound", subject: "site", statement: "One ward." },
      ask("station:site", "site"),
    ] as LedgerEvent[];
    const rows = projectLedger(events);
    expect(rows[0]?.station).toBeUndefined();
    expect(rows[1]?.station).toBe("site");
  });

  test("a topic naming a station is a station even with no station field", () => {
    // Turns written before the field existed still say where they were.
    // D3: `station:tension` names a station that merged into `bind`, and the
    // row resolves to the station that absorbed it rather than losing its
    // attribution. A ledger read by an outside auditor cannot go blank because
    // the product renamed a step.
    expect(projectLedger([ask("station:tension")] as LedgerEvent[])[0]?.station).toBe("bind");
    expect(projectLedger([ask("station:challenge")] as LedgerEvent[])[0]?.station).toBe("bind");
    // And a topic that is not a station is not promoted into one.
    expect(projectLedger([ask("puzzle:root")] as LedgerEvent[])[0]?.station).toBeUndefined();
  });

  test("every station the rail declares can be attributed", () => {
    // Vacuity guard on the two lists agreeing: the filter offers the stations
    // it finds in the ledger, so a rail id the projection cannot carry is a
    // station the filter can never show.
    const events = STATIONS.map((s) => ask(`station:${s.id}`, s.id)) as LedgerEvent[];
    expect(projectLedger(events).map((r) => r.station)).toEqual(STATIONS.map((s) => s.id));
  });
});

describe("the expanded row", () => {
  test("holds every stored field, with the envelope and the summary taken out", () => {
    // The expansion is what makes this an audit trail: the summary is one
    // clause and the record underneath it is the whole event.
    //
    // Restated once, and the property it protected is unchanged: no stored
    // field is lost from the expanded row. Two exclusions are now stated
    // rather than one. The envelope was always excluded, because the id, the
    // stamp and the actor are already on the row. The summary is excluded
    // because for a flag, a finding, a challenge and a question the summary is
    // one stored field printed verbatim, and the expanded row was showing that
    // paragraph in the prose column and again under its own name beside it.
    // `question` moved from the first list to the second for exactly that
    // reason; it is still on screen, as the prose.
    const question = ask("station:site", "site");
    const rows = projectLedger([question]);
    const names = (rows[0]?.fields ?? []).map((f) => f.name);
    const stored = Object.keys(question).filter(
      (k) => !["id", "ts", "actor", "projectId"].includes(k),
    );
    expect(names).toContain("move id");
    expect(names).toContain("reason");
    expect(names).toContain("station");
    // Nothing stored is dropped except `type`, which the Kind column carries,
    // and the one field the prose above already reads out in full.
    const missing = stored.filter(
      (k) => !names.includes(k.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase()),
    );
    expect(missing.sort()).toEqual(["question", "type"]);
    expect(rows[0]?.happened).toBe(
      (question as unknown as { question: string }).question,
    );
    // The envelope is on the row already, and repeating it is noise.
    expect(names).not.toContain("id");
    expect(names).not.toContain("ts");
    expect(names).not.toContain("project id");
  });

  test("origin reads as its canonical word, never as its slug", () => {
    // The rule tests/origin-boundary.test.ts holds for every other surface. The
    // expanded row is rendered text like any other, and it would have printed
    // "author-prior" three pixels under a summary that says "yours".
    const rows = projectLedger([
      {
        ...env("human"),
        type: "ontology-mutation",
        op: "create",
        targetId: "p1",
        pageType: "puzzle",
        origin: "author-prior",
        title: "Drift",
      },
    ] as LedgerEvent[]);
    const origin = (rows[0]?.fields ?? []).find((f) => f.name === "origin");
    expect(origin?.value).toBe("yours");
    expect(rows[0]?.happened).toContain("yours");
    expect(rows[0]?.happened).not.toContain("author-prior");
    // And the row carries the value itself, so the mark can be drawn.
    expect(rows[0]?.origin).toBe("author-prior");
  });

  test("a nested object and an empty array both read as words", () => {
    const rows = projectLedger([
      {
        ...env("human"),
        type: "ontology-mutation",
        op: "relate",
        targetId: "e1",
        edge: { from: "p1", to: "t1", role: "stands-to" },
        puzzleRelation: "contradicts",
        origin: "data-driven",
        supportingChunks: [],
      },
    ] as LedgerEvent[]);
    const fields = new Map((rows[0]?.fields ?? []).map((f) => [f.name, f.value]));
    expect(fields.get("edge")).toBe("from p1, to t1, role stands-to");
    // The stored key is `supportingChunks`; the row is prose the researcher
    // reads, and /material calls the object a passage. Same property as the
    // origin assertion above: a value with a canonical human name is never
    // rendered by its internal one.
    expect(fields.get("supporting passages")).toBe("none");
    expect([...fields.keys()].join(" ")).not.toContain("chunk");
  });
});

describe("the spine's turn label", () => {
  test("reads as words, not as a routing key", () => {
    // The spine printed "lint:phenomenon-troubling-no-theory:b19b3f86-5963-4c18"
    // into a 420-unit viewBox, so a reader got a rule id, a uuid, and a silent
    // cut where the box ended.
    /* M48. The mode was printed raw, so "interrogation" reached the screen:
     * a nominalisation C3 bans, invisible to the copy scan because it arrives
     * through an interpolation of `turn.mode` and a slug is one word. */
    expect(spineLabel("puzzle:root", "interrogation", "answered")).toBe(
      "the thing that you can't account for · a question · answered",
    );
  });

  test("the topic gives way before the outcome does", () => {
    // Cutting the whole string dropped the one word the column is scanned for.
    const long = spineLabel(
      "lint:phenomenon-troubling-no-theory:b19b3f86-5963-4c18-b592-148add8c023c",
      "interrogation",
      "refused",
    );
    expect(long.endsWith("· a question · refused")).toBe(true);
    expect(long).toContain("…");
    // Long enough to say something, short enough to stay inside the viewBox.
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.length).toBeGreaterThan(30);
  });

  test("a short label is left alone", () => {
    const short = spineLabel("station:site", "guidance", "open");
    // D3: the label drops "selection". M42: the topic names the step.
    expect(short).toBe("the Site step · directions · open");
    expect(short).not.toContain("…");
  });
});

describe("the panel renders", () => {
  test("an empty ledger gets the shared empty state, not a bare sentence", () => {
    // FND-09. Three instrumentation panels answered empty with one sentence in
    // no container before the primitive existed, and this was going to be a
    // fourth.
    const html = renderToStaticMarkup(createElement(LedgerView, { events: [] }));
    expect(html).toContain('data-testid="ledger-empty"');
    expect(html).toContain("empty-state-teach");
    expect(html).not.toContain("ledger-table");
  });

  test("a populated ledger renders a header row and one row per event", () => {
    const question = ask("station:site", "site");
    const events: LedgerEvent[] = [
      question,
      { ...env("human"), type: "response", text: "One ward.", inReplyTo: question.id },
      { ...env("human"), type: "bound", subject: "site", statement: "One ward, six nurses." },
    ] as LedgerEvent[];
    const html = renderToStaticMarkup(createElement(LedgerView, { events }));
    expect(html).toContain("What the event changed");
    expect((html.match(/class="ledger-row"/g) ?? []).length).toBe(3);
    // The day is written once, on a band, rather than once per row. That is
    // most of the compression: 44 rows carried 44 copies of the full stamp.
    expect((html.match(/class="ledger-day"/g) ?? []).length).toBe(1);
  });

  test("every kind the union declares is offered as a filter", () => {
    /* A kind with no checkbox is a kind that can never be isolated, and the
     * list is derived from one record rather than hand-maintained beside it.
     *
     * The two counts were the literals 17 and 5, and adding the `export` event
     * broke them. Restated against the union rather than against a number, for
     * the reason this test exists in the first place: the property is that the
     * panel offers exactly what the union declares, and a hand-copied integer is
     * a second list of the kinds, which is what the panel's own header warns
     * against. It now fails when a kind is unreachable and passes when one is
     * added and placed, which is the behaviour that was wanted. */
    const html = renderToStaticMarkup(
      createElement(LedgerView, { events: [ask("puzzle:root")] as LedgerEvent[] }),
    );
    expect(LEDGER_KINDS.length).toBeGreaterThan(17);
    expect((html.match(/class="ledger-kind-key"/g) ?? []).length).toBe(LEDGER_KINDS.length);
    expect((html.match(/class="ledger-family"/g) ?? []).length).toBe(LEDGER_FAMILIES.length);
    // The kind added this wave, named, so the count above cannot go green on a
    // build where an export is unfilterable.
    expect(LEDGER_KINDS).toContain("export");
  });

  test("the station filter offers only the stations the ledger reached", () => {
    // Offering all eight on a study that has touched one is a filter that
    // mostly returns nothing, which teaches the researcher to stop using it.
    const html = renderToStaticMarkup(
      createElement(LedgerView, {
        events: [ask("station:site", "site")] as LedgerEvent[],
      }),
    );
    // D3: the label drops "selection".
    expect(html).toContain(">Site</option>");
    expect(html).not.toContain(">Early data</option>");
  });

  test("no row is expanded until it is asked for", () => {
    // The pane holds up to two hundred rows and each expansion is the whole
    // stored event. Opening them all by default is the 5092px panel again.
    const html = renderToStaticMarkup(
      createElement(LedgerView, { events: [ask("puzzle:root")] as LedgerEvent[] }),
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("ledger-detail");
  });

  test("the matrix the flags name is the matrix this file resolves against", () => {
    // Vacuity guard on cellLabel: a cell id the glossary cannot resolve falls
    // back to the slug, which would put the routing key back on screen without
    // failing anything.
    const cell = MATRIX[0];
    expect(cell).toBeDefined();
    const rows = projectLedger([
      { ...env("system"), type: "flag", matrixCell: cell?.id ?? "", reason: "Fired." },
    ] as LedgerEvent[]);
    expect(rows[0]?.changed).not.toContain(":");
  });
});

/**
 * The sentences the ledger writes (round-one critic finding).
 *
 * 1002 tests passed while 200 of 200 visible rows on the density-200 fixture
 * read "Joined two pages a relation, model-proposed" and the main fixture read
 * "Drafted a observation", because every assertion above this line checks that
 * a summary is non-empty, resolves an id, or avoids a slug, and not one checks
 * that it is a sentence. The projection is pure, so the grammar is testable
 * here rather than only in a browser.
 */
describe("the summary is written, not concatenated", () => {
  const page = (
    op: "create" | "revise" | "retire" | "reinstate",
    targetId: string,
    pageType: string,
    title?: string,
  ): LedgerEvent =>
    ({
      ...env("human"),
      type: "ontology-mutation",
      op,
      targetId,
      pageType,
      origin: "author-prior",
      ...(title === undefined ? {} : { title }),
    }) as LedgerEvent;

  test("no article disagrees with the noun it introduces", () => {
    // The exact defect: `Drafted a ${pageType}` hard-coded the article, so the
    // two vowel-initial page types produced "a observation" and "a analytic
    // residue". A rendered-DOM scan of the main fixture found one "a" before a
    // vowel in the whole app and it was this line.
    const types = [
      "puzzle",
      "theory",
      "observation",
      "analytic-residue",
      "candidate-resolution",
      "rival",
      "scope-condition",
    ] as const;
    const events: LedgerEvent[] = [];
    for (const [i, type] of types.entries()) {
      events.push(page("create", `p${i}`, type, `Page ${i}`));
      events.push({
        ...env("persona:extractor"),
        type: "proposal",
        proposalId: `prop-${i}`,
        pageType: type,
        title: `Candidate ${i}`,
        sourceChunks: [],
      } as LedgerEvent);
    }
    const rows = projectLedger(events);
    for (const r of rows) {
      const text = `${r.happened} ${r.changed}`;
      expect(`${r.kind} "${text}": ${/\ba\s+[aeiou]/i.test(text) ? "a before a vowel" : "ok"}`).toBe(
        `${r.kind} "${text}": ok`,
      );
    }
    // And the vowel cases say the words, rather than merely dodging the regex.
    const drafted = rows.filter((r) => r.kind === "proposal").map((r) => r.happened);
    // M28: copy. The noun is "claim" on every surface now; the article rule
    // this test exists for is unchanged.
    expect(drafted).toContain("Suggested an observation claim for you to look at");
    expect(drafted).toContain("Suggested an analytic residue claim for you to look at");
    expect(drafted).toContain("Suggested a puzzle claim for you to look at");
  });

  test("every ontology op reads as one clause, not a verb glued to a noun", () => {
    // "Joined two pages" was already the whole verb phrase and the page-type
    // fallback "a relation" arrived after it anyway, so the relate row was two
    // noun phrases in a row on every relate event in the study.
    const events: LedgerEvent[] = [
      page("create", "p1", "puzzle", "Handoff drift"),
      page("revise", "p1", "puzzle", "Handoff drift"),
      page("retire", "p1", "puzzle", "Handoff drift"),
      page("reinstate", "p1", "puzzle", "Handoff drift"),
      page("create", "t1", "theory", "Label ambiguity"),
      {
        ...env("human"),
        type: "ontology-mutation",
        op: "relate",
        targetId: "e1",
        edge: { from: "p1", to: "t1", role: "evidences" },
        origin: "data-driven",
      },
      {
        ...env("human"),
        type: "ontology-mutation",
        op: "unrelate",
        targetId: "e1",
        edge: { from: "p1", to: "t1", role: "evidences" },
        origin: "model-proposed",
      },
    ] as LedgerEvent[];
    const rows = projectLedger(events);
    // M28: copy. Same seven clauses, saying "claim" for the object.
    expect(rows.map((r) => r.happened)).toEqual([
      "Created a puzzle claim, marked yours",
      "Revised the puzzle claim, marked yours",
      "Retired the puzzle claim, superseded rather than deleted, marked yours",
      "Brought the puzzle claim back, marked yours",
      // M29: copy. The type is called an expectation now, and the article
      // follows it: "a theory" became "an expectation", which is the grammar
      // this test exists to protect.
      "Created an expectation claim, marked yours",
      "Joined two claims as evidence, marked from the data",
      "Removed a link that stood as evidence, marked AI-suggested",
    ]);
    // The two names go in the object column and not in the summary as well.
    // Measured on the density-200 fixture with both: the summary read "Joined
    // Probe page 39: a title long enough to wrap across the label lin…" on all
    // 200 rows, because every cell here is one line clipped, so the role and
    // the origin fell off the right edge and the pair of names was printed
    // twice on the rows that fitted.
    expect(rows[5]?.changed).toBe("the link between Handoff drift and Label ambiguity");
    expect(rows[5]?.changed).not.toContain("e1");
    expect(rows[5]?.happened).not.toContain("Handoff drift");
  });

  test("an edge whose ends the ledger never named still reads as English", () => {
    // The fallback path, which is the one that shipped. A relate event with no
    // create before it has no title to reach for, and the old fallback was the
    // literal string "a relation" appended to a finished verb phrase.
    const rows = projectLedger([
      {
        ...env("human"),
        type: "ontology-mutation",
        op: "relate",
        targetId: "e9",
        edge: { from: "unknown-a", to: "unknown-b", role: "stands-to" },
        origin: "author-prior",
      },
    ] as LedgerEvent[]);
    // M28: copy.
    expect(rows[0]?.happened).toBe("Joined two claims as the motivating claim, marked yours");
    // Not "e9", and not "a relation" hanging off a finished verb phrase.
    expect(rows[0]?.changed).toBe("the relation");
    expect(rows[0]?.happened).not.toContain("a relation");
  });

  test("no summary anywhere ends in a bare appended noun phrase", () => {
    // The shape of the defect rather than its instance: a comma followed by a
    // hyphenated slug, or a summary ending in an indefinite article plus a
    // single word, is what template concatenation looks like from the outside.
    const question = ask("station:site", "site");
    const finding = {
      ...env("system"),
      type: "lint-finding",
      rule: "orphan-construct",
      targetKind: "page",
      targetId: "p1",
      reason: "Nothing grounds this page.",
    } as LedgerEvent;
    const events: LedgerEvent[] = [
      { ...env("human"), type: "bound", subject: "site", statement: "One ward." },
      question,
      { ...env("human"), type: "response", text: "Yes.", inReplyTo: question.id },
      { ...env("human"), type: "reveal", subject: "modal-twin", via: "stage-gate" },
      { ...env("human"), type: "reveal", subject: "modal-twin", via: "on-demand" },
      { ...env("system"), type: "attention", layer: "retrieval", chunkId: "chunk-aaaaaaaa" },
      page("create", "p1", "observation", "Label drift"),
      { ...env("human"), type: "refusal", questionEventId: question.id, kind: "not-now" },
      finding,
      { ...env("human"), type: "finding-disposition", findingId: finding.id, disposition: "acknowledged" },
    ] as LedgerEvent[];
    for (const r of projectLedger(events)) {
      const s = r.happened;
      expect(`${r.kind} "${s}": ${/,\s*[a-z]+(-[a-z]+)+\s*$/.test(s) ? "trailing slug" : "ok"}`).toBe(
        `${r.kind} "${s}": ok`,
      );
      expect(`${r.kind} "${s}": ${/\b(a|an)\s+\S+$/i.test(s) ? "bare noun phrase" : "ok"}`).toBe(
        `${r.kind} "${s}": ok`,
      );
    }
  });

  test("the section names the ledger before anything is opened", () => {
    // Discoverability. The panel heading read "The ledger" and lived behind a
    // collapsed toggle labelled "Show how this session has gone", so the word
    // existed in the product and on no path to it. Cmd+K for "ledger" returned
    // nothing and no route reaches it. This holds the half that lives in this
    // component: the collapsed section says what it is.
    const html = renderToStaticMarkup(
      createElement(Instrumentation, {
        territory: { engaged: 0, raised: 0, untouched: 0, cells: [], unmapped: [] },
        spine: { turns: [], width: 0, height: 0 },
        trajectory: { points: [], width: 0, height: 0 },
        events: [],
        chunks: [],
        documents: [],
      } as unknown as Parameters<typeof Instrumentation>[0]),
    );
    // M28: copy. The heading leads on "the record", which is what a reader
    // already knows, and glosses "ledger" once in the sentence under it, so
    // both words are still on the closed section. The control says it too.
    expect(html).toContain("instrumentation-title");
    expect(html).toContain("History");
    // M62, ISC-600: the fold's sentence is in every study page's Help panel.
    expect(html).not.toContain("instrumentation-what");
    expect(html).toContain("Show History");
  });

  test("the checkboxes carry the class this surface styles", () => {
    // 20 of 20 reported appearance:auto and accent-color:auto, so the platform
    // blue was the only saturated colour on a three-ink screen. The rule is
    // `.tickbox` in instrumentation.css; a checkbox without the class is back
    // on the UA control and nothing else would notice.
    const html = renderToStaticMarkup(
      createElement(LedgerView, { events: [ask("puzzle:root")] as LedgerEvent[] }),
    );
    // Derived, not counted by hand, for the same reason as the filter test
    // above: one checkbox per declared kind is the property, and 17 was a
    // transcription of it that went stale the moment a kind was added.
    const boxes = (html.match(/type="checkbox"/g) ?? []).length;
    expect(boxes).toBe(LEDGER_KINDS.length);
    expect((html.match(/class="tickbox"/g) ?? []).length).toBe(boxes);
  });
});
