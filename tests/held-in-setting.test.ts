/**
 * An expectation people in the setting hold (M44, owner's decision of
 * 2026-09-13).
 *
 * What the walk of 2026-09-13 found, as Q16 and D43. The expectation chooser
 * offers theory pages whose origin is `literature-derived` or `author-prior` and
 * excludes `model-proposed`, so that a study cannot break the model's own reading
 * of the researcher's transcript and call that a contribution. That exclusion also
 * kept out "Board's leveling expectation for the shared writing tool": the aim
 * Coldharbour's board wrote down in January, in the model as an expectation, and
 * the one the study's own puzzle most plainly breaks. Two checks told the
 * researcher their pairing was wrong and the right expectation was unreachable.
 *
 * The mark is how it reaches the list. Four things are pinned here.
 *
 *   1. The record. A mark carries who holds it, only an expectation can carry one,
 *      and the ledger refuses the field anywhere else.
 *   2. The projection. The holder lands and the origin does not move, which is why
 *      this is its own op rather than a revise.
 *   3. The offer. Unmarked and model-proposed stays off the list; marked is
 *      offered with its holder; the obligation the pairing owes is unchanged.
 *   4. The surfaces. The row, the card and the provenance box say the same thing,
 *      and the box says whose act the mark was.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LedgerEvent, PageType } from "../src/ledger/events.ts";
import { validateEvent } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import {
  checkObligation,
  chunkDocuments,
  expectationSource,
  expectationsOnOffer,
  heldInSetting,
  heldInSettingLine,
} from "../src/ontology/relations.ts";
import {
  markHeldInSetting,
  resetAdjudicationInFlight,
} from "../src/proposals/adjudicate.ts";
import { ExpectationChooser } from "../src/workbench/ExpectationChooser.tsx";
import { MarkHeldInSetting } from "../src/workbench/MarkHeldInSetting.tsx";

import { MARKED_BY, heldMarkOf } from "../src/views/provenance.ts";
import type { OriginDoubt } from "../src/ontology/originAudit.ts";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import { opCounted } from "../src/ui/ontologyOpVocabulary.ts";

const PROJECT = "44444444-4444-4444-8444-444444444444";
/** The walk's own sentence, typed by the researcher into the holder field. */
const HOLDER = "the board, in the January paper";
let seq = 0;

function create(
  id: string,
  type: PageType,
  title: string,
  origin: "model-proposed" | "literature-derived" | "data-driven" = "model-proposed",
): LedgerEvent {
  seq += 1;
  return {
    id: crypto.randomUUID(),
    ts: 1_700_000_000_000 + seq,
    actor: "human",
    projectId: PROJECT,
    type: "ontology-mutation",
    op: "create",
    targetId: id,
    pageType: type,
    origin,
    title,
    body: "b",
    supportingChunks: [],
  } as LedgerEvent;
}

function relate(from: string, to: string, role: string): LedgerEvent {
  seq += 1;
  return {
    id: crypto.randomUUID(),
    ts: 1_700_000_000_000 + seq,
    actor: "human",
    projectId: PROJECT,
    type: "ontology-mutation",
    op: "relate",
    targetId: `held-edge-target-${seq}`,
    edge: { from, to, role },
    origin: "author-prior",
  } as LedgerEvent;
}

function mark(pageId: string, heldBy: string): LedgerEvent {
  seq += 1;
  return {
    id: crypto.randomUUID(),
    ts: 1_700_000_000_000 + seq,
    actor: "human",
    projectId: PROJECT,
    type: "ontology-mutation",
    op: "mark",
    targetId: pageId,
    pageType: "theory",
    origin: "author-prior",
    heldBy,
  } as LedgerEvent;
}

function makeLedger(initial: readonly LedgerEvent[] = []) {
  const store: LedgerEvent[] = [...initial];
  return {
    store,
    appendAll: async (events: readonly LedgerEvent[]) => {
      store.push(...events);
    },
    readEvents: async () => [...store],
  };
}

/** The shipped example's own shape: a puzzle, a paper's expectation, the board's. */
const MODEL = [
  create("pz", "puzzle", "Uniform pages stop mentors from reading them"),
  create("paper", "theory", "Initial position compounds absent a structural change", "literature-derived"),
  create("board", "theory", "Board's leveling expectation for the shared writing tool"),
  create("ob1", "observation", "Introduced founders get longer office-hours slots", "data-driven"),
];

beforeEach(() => {
  resetAdjudicationInFlight();
});

describe("the record carries who holds the expectation (M44)", () => {
  test("a mark names the holder, and a mark with nobody named is refused", () => {
    expect(validateEvent(mark("board", HOLDER))).toEqual([]);
    const anonymous = { ...(mark("board", HOLDER) as unknown as Record<string, unknown>), heldBy: "  " };
    expect(validateEvent(anonymous)).toContain(
      "ontology-mutation.heldBy must name who holds the expectation on mark",
    );
  });

  test("the holder rides on a mark and on no other op, and only on an expectation", () => {
    const onRevise = {
      ...(mark("board", HOLDER) as unknown as Record<string, unknown>),
      op: "revise",
      title: "t",
    };
    expect(validateEvent(onRevise)).toContain("ontology-mutation.heldBy is only for a mark");
    const onObservation = {
      ...(mark("ob1", HOLDER) as unknown as Record<string, unknown>),
      pageType: "observation",
    };
    expect(validateEvent(onObservation)).toContain(
      "ontology-mutation.heldBy is only for theory pages",
    );
  });

  test("the op is counted in the ledger's own words rather than as a revision", () => {
    expect(opCounted("mark", 1)).toBe("1 expectation marked as held in the setting");
  });
});

describe("the mark lands and nothing else moves (M44)", () => {
  test("the holder is on the page, and the origin, version and history are untouched", () => {
    const before = projectOntology(MODEL, PROJECT).pages.get("board");
    const after = projectOntology([...MODEL, mark("board", HOLDER)], PROJECT).pages.get("board");
    expect(after?.heldBy).toBe(HOLDER);
    expect(heldInSetting(after!)).toBe(true);
    /* The whole reason `mark` is not a `revise`. A revise takes the origin off its
     * own event, so marking through one would have moved the board's expectation
     * into the researcher's bucket for the act of saying who wrote the board
     * paper, and the origin is the measurement this ledger exists to make. */
    expect(after?.origin).toBe("model-proposed");
    expect(after?.origin).toBe(before?.origin);
    expect(after?.version).toBe(1);
    expect(after?.history.length).toBe(1);
    expect(after?.title).toBe(before?.title);
  });

  test("the last mark is the one the model carries", () => {
    const graph = projectOntology(
      [...MODEL, mark("board", "the programme team"), mark("board", HOLDER)],
      PROJECT,
    );
    expect(graph.pages.get("board")?.heldBy).toBe(HOLDER);
  });

  test("the door writes it as the researcher's act, and refuses the rest", async () => {
    const ledger = makeLedger(MODEL);
    const outcome = await markHeldInSetting(
      { projectId: PROJECT, pageId: "board", heldBy: `  ${HOLDER}  ` },
      ledger,
    );
    expect(outcome.kind).toBe("recorded");
    const written = ledger.store.at(-1) as {
      op: string;
      actor: string;
      origin: string;
      heldBy: string;
      pageType: string;
    };
    expect(written.op).toBe("mark");
    expect(written.actor).toBe("human");
    expect(written.origin).toBe("author-prior");
    expect(written.pageType).toBe("theory");
    expect(written.heldBy).toBe(HOLDER);
    expect(validateEvent(written)).toEqual([]);

    // The same holder twice writes nothing, so the record does not fill with
    // marks a reader cannot tell apart.
    expect(
      (await markHeldInSetting({ projectId: PROJECT, pageId: "board", heldBy: HOLDER }, ledger))
        .kind,
    ).toBe("no-change");
    // An observation is a finding about the setting rather than something anybody
    // expected of it, so it cannot be held in the setting.
    expect(
      (await markHeldInSetting({ projectId: PROJECT, pageId: "ob1", heldBy: HOLDER }, ledger)).kind,
    ).toBe("rejected");
    // And a mark with nobody named never reaches the ledger.
    expect(
      (await markHeldInSetting({ projectId: PROJECT, pageId: "board", heldBy: "   " }, ledger)).kind,
    ).toBe("rejected");
  });
});

describe("the chooser offers a marked expectation (Q16, D43)", () => {
  test("a model-proposed expectation stays off the list until it is marked", () => {
    const unmarked = expectationsOnOffer(projectOntology(MODEL, PROJECT));
    expect(unmarked.map((p) => p.id)).toEqual(["paper"]);
    const marked = expectationsOnOffer(projectOntology([...MODEL, mark("board", HOLDER)], PROJECT));
    expect(marked.map((p) => p.id).sort()).toEqual(["board", "paper"]);
  });

  test("each option says where its expectation came from", () => {
    const graph = projectOntology([...MODEL, mark("board", HOLDER)], PROJECT);
    expect(expectationSource(graph.pages.get("paper")!)).toBe("from the papers");
    expect(expectationSource(graph.pages.get("board")!)).toBe(
      `held in the setting by ${HOLDER}`,
    );
  });

  test("the list on screen carries the holder beside the board's expectation", () => {
    const graph = projectOntology([...MODEL, mark("board", HOLDER)], PROJECT);
    const html = renderToStaticMarkup(
      createElement(
        LedgerProvider,
        /* The chooser writes through the ledger context, so it needs one to
         * render. An in-memory store, because this test reads the list rather
         * than pressing anything on it. */
        {
          store: new InMemoryLedgerStore(),
          children: createElement(ExpectationChooser, { projectId: PROJECT, graph }),
        },
      ),
    );
    expect(html).toContain('data-testid="expectation-board"');
    expect(html).toContain("held in the setting by the board, in the January paper");
    expect(html).toContain("from the papers");
  });

  test("what the pairing owes does not change with the mark", () => {
    const docs = chunkDocuments([{ id: "c1", documentId: "slot-log" }]);
    const owes = (events: readonly LedgerEvent[]) =>
      checkObligation(projectOntology(events, PROJECT), "pz", "board", "contradicts", docs);
    const framed = [...MODEL, relate("pz", "board", "stands-to")];
    const before = owes(framed);
    const after = owes([...framed, mark("board", HOLDER)]);
    /* The obligations read the graph's shape and never a provenance field, which
     * is the sentence `expectationSource` states in full: `contradicts` owes a
     * marked expectation the same two observations from two different documents
     * that it owes a paper's. */
    expect(after.discharged).toBe(before.discharged);
    expect(after.detail).toBe(before.detail);
    expect(after.owed).toBe("a pattern rather than a single instance");
    expect(after.evidence).toBe(
      "at least two observations from two different documents of your data",
    );
  });
});

describe("the surfaces say the same thing (M44)", () => {
  const graph = projectOntology([...MODEL, mark("board", HOLDER)], PROJECT);

  // M63, the lead's rulings of 2026-09-30: the old model tab's PagePanel left with it; superseded: "the row carries the mark, and the card carries the holder"

  // M63, the lead's rulings of 2026-09-30: the old model tab's PagePanel left with it; superseded: "an unmarked expectation gets the ask, and no surface asserts a holder"

  // M63, the lead's rulings of 2026-09-30: the old model tab's PagePanel left with it; superseded: "with no handler the card shows the mark and offers no control"

  test("the control asks for the holder and says what the answer buys", () => {
    const html = renderToStaticMarkup(
      createElement(MarkHeldInSetting, {
        title: "Board's leveling expectation for the shared writing tool",
        onMark: () => {},
        testId: "held-board",
      }),
    );
    expect(html).toContain('data-testid="held-board-ask"');
    const open = renderToStaticMarkup(
      createElement(MarkHeldInSetting, {
        title: "Board's leveling expectation for the shared writing tool",
        heldBy: HOLDER,
        onMark: () => {},
        testId: "held-board",
      }),
    );
    // The holder already on the record is what the field opens on, so a change is
    // an edit rather than a retype.
    expect(open).toContain("Change holder");
  });

  test("the provenance box says who marked it and when", () => {
    const events = [...MODEL, mark("board", HOLDER)];
    const markRead = heldMarkOf(events, PROJECT, "board");
    expect(markRead?.holder).toBe(HOLDER);
    expect(markRead?.by).toBe("you");
    /* The sentence the box prints, and whose act it says the mark was. The box
     * itself is driven in tests/provenance.test.ts, which owns the DOM harness
     * that opens a popover; what is pinned here is that the reading the box draws
     * carries the mark at all, and that the researcher is the one it names. */
    expect(MARKED_BY[markRead!.by]).toBe("You marked this expectation as held in the setting");
    expect(heldMarkOf(MODEL, PROJECT, "board")).toBeNull();
  });
});
