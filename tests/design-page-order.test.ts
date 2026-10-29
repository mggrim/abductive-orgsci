/**
 * The bottom of the design page (ISC-357 … ISC-360).
 *
 * Matthew's report was "the bottom of the design page is very poorly
 * organized, it doesn't make sense to the user", and reading the rendered page
 * rather than the code is what turned that into four separate defects. The
 * banner at the top said "Waiting on: you, on the staged proposals, or pick
 * the next question" and both of those things sat below a log of what had
 * already happened — the questions 900px down the left column, the tray behind
 * a 420px graph canvas holding two nodes. Half of the visible transcript was
 * the word "Not now." set in full-size cards. Two of the three questions on
 * offer explained themselves with `Structural lint 'orphan-construct' fired:`.
 *
 * None of that is a rendering bug and none of it would fail a test written
 * against behaviour. It is an ordering problem, so the tests here are about
 * order and about vocabulary.
 */

import { describe, expect, test } from "bun:test";
import { dialogueOrder, withoutClosingQuestion } from "../src/workbench/Dialogue.tsx";
import { layoutGraph } from "../src/workbench/graphLayout.ts";
import { generateMoves } from "../src/interview/moves.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { projectInterview } from "../src/interview/state.ts";
import { MATRIX } from "../src/matrix/matrix.ts";
import type { LedgerEvent, PageType } from "../src/ledger/events.ts";

const PROJECT = "study-1";

function created(id: string, type: PageType, title: string): LedgerEvent {
  return {
    id: `e-${id}`,
    ts: 1,
    actor: "human",
    projectId: PROJECT,
    type: "ontology-mutation",
    op: "create",
    targetId: id,
    pageType: type,
    title,
    body: "",
    origin: "author-prior",
    citations: [],
  } as LedgerEvent;
}

describe("the box you type in sits under the conversation (ISC-357, M37)", () => {
  /*
   * M37 replaced the rule this block was written for, and the two tests it
   * changed are recorded here rather than deleted.
   *
   * The old rule was "whatever you can act on next sits directly under the
   * station card", which flipped the column: with a question outstanding the
   * transcript came first and the answer box under it, and with nothing
   * outstanding the menu of next questions came first and the transcript went
   * to the bottom. That was right while the thing you acted on was a menu. It
   * is wrong now that the thing you act on is the conversation: a chat box that
   * moves above the transcript half the time is a chat box nobody can use, and
   * the menu left the page altogether at M59.
   *
   * What survives is the half of the old rule that was always the real one: you
   * never type at something you cannot see.
   */
  test("with nothing outstanding, the conversation still comes before the box", () => {
    const order = dialogueOrder(false);
    expect(order.indexOf("record")).toBeLessThan(order.indexOf("chat"));
  });

  test("with an open question, the transcript comes before the chat box", () => {
    // The last turn of the transcript is the question being answered, so it has
    // to sit above the box. Flipping this would have the researcher typing at a
    // question they cannot see.
    const order = dialogueOrder(true);
    expect(order.indexOf("record")).toBeLessThan(order.indexOf("chat"));
  });

  test("the order does not change with the state of the exchange", () => {
    // The flip is gone, which is the point: a control that moves up and down
    // the page depending on whether a question is open cannot be learned.
    expect(dialogueOrder(true)).toEqual(dialogueOrder(false));
  });

  /* M59, ISC-570. The offered set left the page: Matthew, 2026-09-27, "get rid
   * of ask about something else". The moves stay in the record and the model's
   * brief. `tests/m59-design.test.ts` holds the rendered half. */
  test("the offered set is no longer on the page (M59)", () => {
    for (const live of [true, false]) {
      expect(dialogueOrder(live) as readonly string[]).not.toContain("action");
    }
  });

  test("Anti: no slot names the removed redirect box", () => {
    for (const place of ["none", "here", "elsewhere", "unplaced"] as const) {
      expect(dialogueOrder(true, false, place)).not.toContain("redirect");
      expect(dialogueOrder(false, false, place)).not.toContain("redirect");
    }
  });

  test("a question open at another station points there and still lets you write here (ISC-377, M37)", () => {
    // Two wrong versions preceded this. The exchange was first folded into the
    // station's own transcript, so a section headed "the conversation here"
    // showed a question from elsewhere with a caption explaining the
    // contradiction. Then it got its own correctly-labelled block and appeared
    // at all eight stations, turning one unanswered question into eight copies
    // of the same prompt.
    const order = dialogueOrder(true, false, "elsewhere");
    expect(order[0]).toBe("open");
    // The chat box stays (M37). Writing here records a redirection to this
    // place, which sets the other question aside, so the box works. Without it
    // a step's opener blocked "Talk it through" at the framing.
    expect(order).toContain("chat");
    expect(order.indexOf("open")).toBeLessThan(order.indexOf("chat"));
    // No next-question list either: the orchestrator refuses to select a move
    // while one is outstanding, so every card would fail on click.
    expect(order as readonly string[]).not.toContain("action");
  });

  test("Anti: a question opened here does not get the elsewhere block", () => {
    expect(dialogueOrder(true, false, "here")).not.toContain("open");
    expect(dialogueOrder(false, false, "none")).not.toContain("open");
  });

  test("read-only is the record and nothing to act with (ISC-370)", () => {
    // The Ontology view reads the conversation against the pages it produced.
    // Leaving the answer box there gave the tool a second place to conduct the
    // interview, on a page with no station to record the turn against.
    expect(dialogueOrder(false, true)).toEqual(["record"]);
    expect(dialogueOrder(true, true)).toEqual(["record"]);
  });

  test("Anti: read-only is not the same as having nothing outstanding", () => {
    // A station with no question on the table still has its chat box.
    expect(dialogueOrder(false, false)).toContain("chat");
  });

  test("Anti: no slot is dropped or duplicated by the ordering", () => {
    for (const live of [true, false]) {
      const order = dialogueOrder(live);
      expect(new Set(order).size).toBe(order.length);
      expect(order).toContain("status");
      expect(order).toContain("record");
      // The fourth item asked for the redirect slot. M47 removed the box, so
      // asking for the slot here would pin a control the page no longer has.
    }
  });
});

describe("a delivered question appears once (ISC-361)", () => {
  test("the model's closing restatement is dropped, the reaction is kept", () => {
    const text =
      "That drift with no visible decision point makes me want to check your footing.\n\nIf someone who works this ward read back what you wrote, what would they say you got wrong?";
    expect(withoutClosingQuestion(text)).toBe(
      "That drift with no visible decision point makes me want to check your footing.",
    );
  });

  test("a single-newline turn is handled too, since the model chooses its own spacing", () => {
    expect(withoutClosingQuestion("A reaction.\nAnd the question?")).toBe("A reaction.");
  });

  test("Anti: a turn that does not end on a question keeps all of its text", () => {
    // The contract says the reply ends on the question. When the model ignores
    // it, nothing is stripped and the selected question renders below the
    // whole turn — a visible contract breach rather than a silent truncation.
    const text = "Here is a thought.\n\nAnd here is a flat statement about it.";
    expect(withoutClosingQuestion(text)).toBe(text);
  });

  test("Anti: a turn that is nothing but the question is not emptied of its question", () => {
    // One paragraph, so there is no reaction to keep. The selected question
    // still renders; stripping here would leave a card with nothing in it.
    expect(withoutClosingQuestion("So what happened next?")).toBe("So what happened next?");
  });

  test("Anti: only the closing question goes, not an earlier one", () => {
    const text = "Why does that matter?\n\nBecause it does.\n\nWhat do you think?";
    expect(withoutClosingQuestion(text)).toBe("Why does that matter?\n\nBecause it does.");
  });
});

describe("the graph canvas grows with the ontology (ISC-359)", () => {
  const withPages = (n: number) =>
    projectOntology(
      Array.from({ length: n }, (_, i) => created(`page-${i}`, "observation", `Page ${i}`)),
      PROJECT,
    );

  test("a two-page ontology gets a shorter canvas than a full one", () => {
    // The SVG renders at width:100% with the viewBox setting the aspect ratio,
    // so canvas height is page height. Two dots in opposite corners of a
    // 420px box is what pushed the staged proposals below the fold.
    expect(layoutGraph(withPages(2)).height).toBeLessThan(layoutGraph(withPages(12)).height);
  });

  /* Forty pages, and the titles are the difference (round four).
   *
   * `withPages` names a page "Page 12", which wraps to one line 52 units wide,
   * and forty of those can be placed on this canvas. A page in a real study is
   * titled "Handoff observation number 12 on the night ward", which wraps to
   * three lines 165 wide, and forty of those cannot be placed at any size. The
   * drawing now decides between them by placing the blocks and measuring, so
   * these two graphs take the two branches and both are asserted: the drawing
   * that cannot name its pages is still inside the box this canvas has always
   * been capped to, and the one that can is inside the box a named canvas gets.
   */
  const withLongTitles = (n: number) =>
    projectOntology(
      Array.from({ length: n }, (_, i) =>
        created(`page-${i}`, "observation", `Handoff observation number ${i} on the night ward`),
      ),
      PROJECT,
    );

  test("it never exceeds the height it used to be fixed at", () => {
    const unnamed = layoutGraph(withLongTitles(40));
    expect(unnamed.nodes.every((n) => n.label.length === 0)).toBe(true);
    expect(unnamed.height).toBeLessThanOrEqual(420);
  });

  test("and forty pages it can name are inside a named canvas's own ceiling", () => {
    /* The same forty pages, with titles short enough to place. This used to be
     * capped at 420 with the names dropped, and the drop was decided by an area
     * sum that had never looked at a placement. It is 720x712 with forty names
     * on it now, which is the ceiling for a named canvas rather than no ceiling
     * at all: square, and this one is inside it. */
    const named = layoutGraph(withPages(40));
    expect(named.nodes.every((n) => n.label.length > 0)).toBe(true);
    expect(named.height).toBeLessThanOrEqual(named.width);
  });

  test("and a drawing that is carrying names is bounded too, one aspect out", () => {
    /* The bound above is the one this canvas has always had and forty pages,
     * which the drawing cannot name, are still inside it. A drawing that is
     * carrying names is allowed past it, because a caption is a wide block hung
     * under a small disc and height is the axis names need: at CANVAS_ASPECT a
     * 657-unit column offers 383 units of height, and twelve named pages want
     * 621. That was the measured defect. It is not a licence to grow, so the
     * bound is restated rather than dropped: square, and no further, whichever
     * side of the names the drawing is on.
     *
     * Both halves asserted on the same graph at the same width, because the
     * failure this replaces was a rule that held for one kind of drawing while
     * the other kind quietly had none. */
    for (const n of [1, 2, 5, 12, 20, 40]) {
      for (const width of [657, 720, 950]) {
        const l = layoutGraph(withPages(n), { maxWidth: width });
        const named = l.nodes.some((node) => node.label.length > 0);
        expect({
          n,
          width,
          named,
          bounded: l.height <= (named ? l.width : l.width / (720 / 420)) + 0.5,
        }).toEqual({ n, width, named, bounded: true });
      }
    }
  });

  test("Anti: an empty ontology still gets a canvas rather than a zero-height one", () => {
    expect(layoutGraph(withPages(0)).height).toBeGreaterThanOrEqual(200);
  });

  test("an explicit height still wins, so the viewport test keeps meaning what it did", () => {
    expect(layoutGraph(withPages(2), { width: 400, height: 300 }).height).toBe(300);
  });

  test("an explicit width wins too, for the same reason", () => {
    expect(layoutGraph(withPages(2), { width: 400, height: 300 }).width).toBe(400);
  });

  /* The marks fill the canvas, and they say what they are.
   *
   * The survey measured the fixture: a 596x134 rendered box on a 720x160.48
   * viewBox holding two discs at 13.5% and 86.5% of the width, 430 of 720 units
   * of empty paper between their rims, and both captions ellipsed at 26
   * characters while the full titles rendered in a list 400px below. So the
   * view the product is named for showed two pages whose names it would not
   * say, in a letterbox that was 2.7% ink. Every assertion below is on the
   * fixture's own shape: two pages, no relations, long titles.
   */
  const TWO_LONG = projectOntology(
    [
      created("a", "observation", "Agreement about the handoff, disagreement about the patient"),
      created("b", "puzzle", "Communication-problem framing may be watching the wrong object"),
    ],
    PROJECT,
  );

  test("the marks are a real share of the canvas rather than dust in a letterbox", () => {
    const l = layoutGraph(TWO_LONG);
    const ink = l.nodes.reduce((s, n) => s + Math.PI * n.radius ** 2, 0);
    expect(ink / (l.width * l.height)).toBeGreaterThan(0.1);
  });

  test("no pair of rims is separated by most of the canvas", () => {
    const l = layoutGraph(TWO_LONG);
    const [a, b] = l.nodes;
    if (a === undefined || b === undefined) throw new Error("expected two nodes");
    const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius;
    expect(gap).toBeLessThan(l.width * 0.4);
  });

  test("a caption says the whole title rather than its first 25 characters", () => {
    for (const node of layoutGraph(TWO_LONG).nodes) {
      expect({ id: node.id, joined: node.label.join(" ") }).toEqual({
        id: node.id,
        joined: node.title,
      });
      expect(node.label.join("")).not.toContain("…");
    }
  });

  test("the size channel is off until a relation exists for size to be about", () => {
    // It fired at 1.47x in radius, 2.15x in area, to say "one of the pages the
    // rest of this ontology hangs off" on a graph with zero edges.
    const radii = new Set(layoutGraph(TWO_LONG).nodes.map((n) => n.radius));
    expect(radii.size).toBe(1);
  });

  test("and back on once something hangs off something", () => {
    const joined = projectOntology(
      [
        created("a", "puzzle", "The puzzle everything hangs off"),
        created("b", "observation", "A page that hangs off it"),
        {
          ...created("a", "puzzle", "x"),
          op: "relate",
          targetId: "b->a",
          edge: { from: "b", to: "a", role: "evidences" },
        } as LedgerEvent,
      ],
      PROJECT,
    );
    expect(new Set(layoutGraph(joined).nodes.map((n) => n.radius)).size).toBe(2);
  });

  test("the viewBox never gets so narrow that the rendered figure goes portrait", () => {
    // The aspect is the viewBox: the SVG is width:100% and height:auto, so
    // cropping width without a floor made a five-page ontology 791px tall in a
    // 596px column, which is worse than the letterbox it replaced.
    for (const n of [1, 2, 5, 12, 40]) {
      const l = layoutGraph(withPages(n));
      expect({ n, tall: l.height > l.width }).toEqual({ n, tall: false });
    }
  });

  test("and the crop is still never what makes one portrait", () => {
    /* The defect above was the crop: the width was cropped to what the marks
     * used while the height was not, so the figure went portrait on a canvas
     * that had been laid out landscape. A named canvas may now be laid out
     * taller than it is wide on purpose, which is a different thing, and this
     * asserts the difference: whatever shape the drawing ends up, the crop
     * never takes the width below the landscape floor it has always had unless
     * the canvas itself was that narrow.
     *
     * Long titles, because that is the case that takes the taller canvas and
     * therefore the case where the two could be confused. */
    const longTitles = (n: number) =>
      projectOntology(
        Array.from({ length: n }, (_, i) =>
          created(`page-${i}`, "observation", `Probe page ${i}: a title long enough to wrap`),
        ),
        PROJECT,
      );
    for (const n of [2, 5, 12, 20]) {
      for (const width of [657, 950]) {
        const l = layoutGraph(longTitles(n), { maxWidth: width });
        expect({
          n,
          width,
          cropped: l.width >= Math.min(width, l.height * (720 / 420)) - 0.5,
        }).toEqual({ n, width, cropped: true });
      }
    }
  });
});

describe("a question explains itself in the reader's vocabulary (ISC-360)", () => {
  /* M89 (2026-10-14): the finding-sourced moves left with the checks, so this
   * block reads the vocabulary of the moves that stay. */
  const moves = () =>
    generateMoves({
      // A puzzle root has to exist or the cold-start moves take every slot.
      graph: projectOntology(
        [
          created("z1", "puzzle", "Handoff agreement does not track patient agreement"),
          created("o1", "observation", "Agreement about the handoff"),
        ],
        PROJECT,
      ),
      state: projectInterview([], PROJECT),
      coveredCells: [],
      matrix: MATRIX,
      turnIndex: 0,
    });

  test("no rationale says a rule fired or names a lint", () => {
    const all = moves();
    // Vacuity guard: an empty list would pass the loop below over nothing.
    expect(all.length).toBeGreaterThan(0);
    for (const m of all) {
      expect(m.rationale.toLowerCase()).not.toContain("fired");
      expect(m.rationale.toLowerCase()).not.toContain("lint");
    }
  });
});

describe("an open question is shown exactly where it can be answered (ISC-377)", () => {
  test("filed under no station, it is shown in full and answerable anywhere", () => {
    // Studies predating ISC-367 have questions with no station. There is
    // nowhere to send the researcher, so pointing at a place would be worse
    // than useless. Shown in its own block rather than folded into "the
    // conversation here", which is the mistake this component made twice.
    const order = dialogueOrder(true, false, "unplaced");
    expect(order[0]).toBe("open");
    expect(order).toContain("chat");
    expect(order.indexOf("open")).toBeLessThan(order.indexOf("chat"));
  });

  /* M58 replaced "unplaced still puts the station's own record last". The chat
   * people know keeps the thread above the composer whatever is open where, so
   * the record sits under the pointer to the open question and over the box. */
  test("unplaced keeps the thread above the composer (M58, ISC-564)", () => {
    const order = dialogueOrder(true, false, "unplaced");
    expect(order[0]).toBe("open");
    expect(order.indexOf("record")).toBeLessThan(order.indexOf("chat"));
  });

  /* M47: "Anti: every place keeps redirection reachable" stood here and asked
   * every place for the redirect slot. The slot is gone with the box, and the
   * redirection it recorded is written by the paths that still write one. */
});
