/**
 * The shared primitives (FND-06, FND-09, FIN-01).
 *
 * Content and logic tests, for the same reason the station prompts have them:
 * the words are the product. /design/context alone offered five ways to
 * decline, with nothing anywhere stating the difference between "Not yet" and
 * "Not now", and /coherence dropped defer entirely. A vocabulary that lives in
 * one table is only one vocabulary while something checks that the table is the
 * only one.
 *
 * These read the modules rather than a rendered tree, which is the right
 * instrument and also the only one: there is no DOM in this suite. The three
 * properties that matter are all expressible without one, because the
 * components were written to make them so. The reason field's tab position is a
 * pure function of the draft state, the finding's required fields are a type,
 * and the teaching line is a required prop. Where a property is genuinely about
 * the markup, the probe reads the source and carries an anti-case, which is the
 * pattern the rest of the suite already uses.
 */

import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import {
  DECISION_ORDER,
  DECISION_VERBS,
  REASON_CLOSED,
  canRecordDecline,
  decisionButtonClass,
  decisionRoles,
  editReason,
  openReason,
  reasonFieldIsLive,
  reasonGiven,
  type DecisionRole,
} from "../src/ui/components/decisions.ts";
import { decisionTabOrder } from "../src/ui/components/DecisionGroup.tsx";
import { emptyStateModel } from "../src/ui/components/EmptyState.tsx";
import { chipModel } from "../src/ui/components/StatusChip.tsx";
import { fieldAria, fieldErrorId, fieldHintId } from "../src/ui/components/Field.tsx";
import { disclosureChip } from "../src/ui/components/Disclosure.tsx";

const ROOT = new URL("../src/ui/components/", import.meta.url).pathname;
const STYLES = new URL("../src/ui/styles/", import.meta.url).pathname;

async function source(file: string): Promise<string> {
  return await Bun.file(`${ROOT}${file}`).text();
}

/** Strip comments, so a probe never matches the reasoning about the code. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("one decision vocabulary", () => {
  test("there are exactly three roles and declining is one of them", () => {
    expect(DECISION_ORDER).toEqual(["accept", "decline", "defer"]);
    expect(Object.keys(DECISION_VERBS).sort()).toEqual(["accept", "decline", "defer"]);
  });

  test("every verb says what it does, and declining is the one that takes a reason", () => {
    for (const role of DECISION_ORDER) {
      const verb = DECISION_VERBS[role];
      expect(verb.label.length).toBeGreaterThan(2);
      // The meaning is what goes in the tooltip and the shortcut sheet. A verb
      // with no stated meaning is how "Not yet" and "Not now" came to sit
      // beside each other on one screen.
      expect(verb.meaning.length).toBeGreaterThan(20);
      expect(verb.wantsReason).toBe(role === "decline");
    }
  });

  test("no verb says or implies that anything is withheld", () => {
    // House rule: nothing gates, and the tool never says it does. Declining is
    // first-class, recorded, and never penalised.
    const banned = /until you|before you can|required|must first|not allowed|blocked/i;
    for (const role of DECISION_ORDER) {
      expect(DECISION_VERBS[role].meaning).not.toMatch(banned);
    }
  });

  test("declining says it is kept on the record", () => {
    expect(DECISION_VERBS.decline.meaning).toMatch(/record|stays listed/i);
  });

  test("neither declination denies the record, and deferring is a declination", () => {
    // This assertion existed for `decline` alone, and the shape it locked let
    // the other declination lie. `defer` read "Leaves it open. Nothing is
    // recorded except that you looked" while its only consumer, the station
    // decision row, appended a bound event on press and redrew the rail with
    // the set-aside mark. The tooltip denied the record eight pixels above a
    // paragraph asserting it. Both declinations are recorded here, so the
    // positive claim is required of both and the denial is barred outright.
    const denies = /nothing is recorded|not recorded|no record|leaves no trace|without recording/i;
    for (const role of DECISION_ORDER) {
      expect(DECISION_VERBS[role].meaning).not.toMatch(denies);
    }
    expect(DECISION_VERBS.defer.meaning).toMatch(/record|stays listed/i);
  });

  test("accept is the only primary, and the other two are equal to each other", () => {
    // Equal weight so declining is comparable to accepting, distinct treatment
    // so the expected path is still unmistakable. All three were the same
    // outline pill, which is why nothing read as the expected path at all.
    expect(decisionButtonClass("accept")).toBe("btn-primary");
    expect(decisionButtonClass("decline")).toBe(decisionButtonClass("defer"));
    expect(decisionButtonClass("decline")).not.toBe(decisionButtonClass("accept"));
  });

  test("a surface may drop accept or defer and may never drop decline", () => {
    // It was a sentence in a prop comment, which is a hope rather than a
    // constraint. Declining is first-class, and a surface author under deadline
    // is exactly who removes the control that records it.
    expect(decisionRoles()).toEqual(["accept", "decline", "defer"]);
    expect(decisionRoles(["defer"])).toEqual(["accept", "decline"]);
    expect(decisionRoles(["accept"])).toEqual(["decline", "defer"]);
    expect(decisionRoles(["accept", "decline", "defer"])).toEqual(["decline"]);
  });
});

describe("the reason field is out of the tab order until the decline path is live", () => {
  test("the closed row is the three buttons and nothing else", () => {
    // A field that is always mounted but only sometimes meaningful is a tab
    // stop the researcher hits on every pass and has to reason about. The
    // component does not render it, so it is out of the accessibility tree and
    // out of sequential focus navigation at once.
    const order = decisionTabOrder(decisionRoles(), REASON_CLOSED);
    expect(order).toEqual(["decide:accept", "decide:decline", "decide:defer"]);
    expect(order.some((id) => id.includes("reason"))).toBe(false);
    expect(reasonFieldIsLive(REASON_CLOSED)).toBe(false);
  });

  test("opening the decline path puts the field and its two controls in, in order", () => {
    const order = decisionTabOrder(decisionRoles(), openReason());
    expect(order).toEqual([
      "decide:accept",
      "decide:decline",
      "decide:defer",
      "decline:reason",
      "decline:record",
      "decline:back",
    ]);
    expect(reasonFieldIsLive(openReason())).toBe(true);
  });

  test("Anti: the probe would fire on a field that is always mounted", () => {
    // Vacuity guard. If decisionTabOrder ignored the draft, the two assertions
    // above would be the same assertion twice.
    const always = (roles: readonly DecisionRole[]) => [...roles, "decline:reason"];
    expect(always(["accept"]).some((id) => id.includes("reason"))).toBe(true);
    expect(decisionTabOrder(decisionRoles(), REASON_CLOSED)).not.toEqual(
      decisionTabOrder(decisionRoles(), openReason()),
    );
  });

  test("the source mounts the field conditionally rather than hiding it", async () => {
    // The failure mode this catches is a later edit that swaps the conditional
    // mount for `hidden` or `display: none`, both of which leave the field in
    // the tree for some assistive technology and neither of which is visible in
    // the pure functions above.
    const src = code(await source("DecisionGroup.tsx"));
    expect(src).toContain("{draft.open && (");
    expect(src).not.toMatch(/hidden=|display:\s*none/);
  });

  test("a decline with no reason is still recordable", () => {
    // Requiring a sentence before the tool will record a no is a gate on the
    // one move this tool exists to make cheap.
    expect(canRecordDecline(REASON_CLOSED)).toBe(true);
    expect(canRecordDecline(openReason(""))).toBe(true);
    expect(reasonGiven(openReason("   "))).toBe("");
    expect(reasonGiven(openReason("  the ward is not the site  "))).toBe("the ward is not the site");
    expect(reasonGiven(REASON_CLOSED)).toBe("");
  });

  test("editing a closed draft is a no-op rather than a silent open", () => {
    expect(editReason(REASON_CLOSED, "typed")).toEqual(REASON_CLOSED);
    expect(editReason(openReason(), "typed")).toEqual({ open: true, reason: "typed" });
  });
});

describe("an empty state has to teach something", () => {
  test("the teaching line is a required prop", async () => {
    // Three instrumentation panels answered empty with one bare sentence in no
    // container and ExportBar had no empty state at all. The prop being
    // required is the whole enforcement: a surface that ships "Nothing staged."
    // does not compile.
    const src = code(await source("EmptyState.tsx"));
    const props = src.slice(src.indexOf("export function EmptyState"));
    expect(props).toMatch(/\n\s+teach: string;/);
    expect(props).not.toMatch(/teach\?:/);
    // status is required for the same reason; action is not, because some
    // regions are empty for a reason the researcher cannot act on yet.
    expect(props).toMatch(/\n\s+status: string;/);
    expect(props).toMatch(/action\?:/);
  });

  test("Anti: that probe distinguishes required from optional", () => {
    expect(/\n\s+teach: string;/.test("\n  teach?: string;")).toBe(false);
    expect(/\n\s+teach: string;/.test("\n  teach: string;")).toBe(true);
  });

  test("the waiting state swaps the status and keeps the teaching line", () => {
    // An empty region and a region that has not answered yet looked identical,
    // and a coherence pass is a model call.
    const idle = emptyStateModel({ status: "No findings.", teach: "Checks run on demand." });
    expect(idle).toEqual({ status: "No findings.", teach: "Checks run on demand.", busy: false });

    const busy = emptyStateModel({ status: "No findings.", teach: "Checks run on demand.", busy: true });
    expect(busy.busy).toBe(true);
    expect(busy.status).not.toBe("No findings.");
    expect(busy.teach).toBe("Checks run on demand.");

    const named = emptyStateModel({
      status: "No findings.",
      teach: "Checks run on demand.",
      busy: true,
      busyStatus: "Reading the brief against the graph.",
    });
    expect(named.status).toBe("Reading the brief against the graph.");
  });

  test("the action is not offered while the region is waiting", async () => {
    // A control that grays out and comes back reads as a failure, and there is
    // nothing to act on until the call answers.
    const src = code(await source("EmptyState.tsx"));
    expect(src).toContain("action !== undefined && !model.busy");
  });
});

describe("the small primitives have one grammar each", () => {
  test("a chip carries text as well as tone, and a count of zero still renders", () => {
    expect(chipModel({ label: "Open", count: 0 })).toEqual({
      label: "Open",
      tone: "neutral",
      count: "0",
      text: "Open 0",
    });
    expect(chipModel({ label: "Accepted", tone: "ok" }).count).toBeUndefined();
    expect(chipModel({ label: "Accepted", tone: "ok" }).text).toBe("Accepted");
  });

  test("a fold with a count of zero says zero rather than hiding", () => {
    // A summary that hides its count when it is zero is one where the
    // researcher cannot tell an empty fold from a fold nothing looked in.
    expect(disclosureChip(0)).toEqual({ label: "items", count: 0 });
    expect(disclosureChip(3, "sources")).toEqual({ label: "sources", count: 3 });
    expect(disclosureChip(undefined)).toBeUndefined();
  });

  test("a field's hint and error are wired to the control, in reading order", () => {
    // A hint that nothing references is a sentence a screen reader never
    // reaches, and every hint in the app was in that state.
    expect(fieldAria("token", {})).toEqual({});
    expect(fieldAria("token", { hint: true })).toEqual({ "aria-describedby": "token-hint" });
    expect(fieldAria("token", { hint: true, error: true })).toEqual({
      "aria-describedby": "token-hint token-error",
      "aria-invalid": true,
    });
    expect(fieldAria("token", { error: true })).toEqual({
      "aria-describedby": "token-error",
      "aria-invalid": true,
    });
    expect(fieldHintId("token")).toBe("token-hint");
    expect(fieldErrorId("token")).toBe("token-error");
  });

  test("the field renders the ids the aria helper points at", async () => {
    const src = code(await source("Field.tsx"));
    expect(src).toContain("id={fieldHintId(htmlFor)}");
    expect(src).toContain("id={fieldErrorId(htmlFor)}");
    expect(src).toContain('role="alert"');
  });

  test("the disclosure stays a native details element", async () => {
    // Keyboard behaviour, the triangle and the open state come from the
    // browser. A button with aria-expanded and a div is the version that goes
    // wrong in one browser and nobody notices.
    const src = code(await source("Disclosure.tsx"));
    expect(src).toContain("<details");
    expect(src).toContain("<summary>");
    expect(src).not.toContain("aria-expanded");
  });
});

describe("the primitives are the only implementation of what they cover", () => {
  test("every primitive named in the foundations brief exists", async () => {
    // Exact equality, unchanged in what it protects: a surface builder cannot
    // drop a seventh EmptyState in here and have it go unnoticed. inert.tsx was
    // added to the list rather than the list being loosened, because it is a
    // primitive the brief did not name and the sixth round required: disabled
    // was the one control state the layer never designed, and the seven
    // controls wearing it said nothing about what would make them live.
    // OriginSwatch joined it on the same terms in round seven, for the same
    // shape of reason: three legends were each painting their own version of
    // the origin mark and none of them was the disc the figure beside it drew.
    // Round nine replaced it with PageMark, which is the same primitive plus
    // the page hue: OriginSwatch could draw an origin but not a page, so a
    // surface that needed a page still had to fetch the hue itself and pass it
    // in, and the surface that did that wrongly is what round eight was about.
    // RelationMark.tsx joined on the same terms again, one object along: the
    // screen declared an arrowhead per family and the exported figure declared
    // none, so direction was in the ledger and on the glass and absent from the
    // one artefact that leaves the tool. The list is added to rather than
    // loosened, because what it protects is that a seventh EmptyState cannot
    // arrive here unnoticed.
    const files: string[] = [];
    for await (const rel of new Glob("*.{ts,tsx}").scan(ROOT)) files.push(rel);
    expect(files.sort()).toEqual([
      "DecisionGroup.tsx",
      "Disclosure.tsx",
      // M45, and on the same terms as `Separator.tsx` below: a control with an
      // ARIA contract belongs here rather than inline in the surface that needs
      // it first. `DockHandle` is the grab on the framing dock's top edge, which
      // the owner asked for on 2026-09-13 ("Your framing should be further
      // expandable by way of dragging the section divider up"). It is not
      // `Separator` with an orientation flag: that one's value is a pane's share
      // of a frame measured along x inside its own parent, and this one's is a
      // height measured from the window's bottom edge and inverted, so a flag
      // would have parameterised the axis, the direction, the box, the value
      // space and the label. See the header of DockHandle.tsx.
      "DockHandle.tsx",
      "EmptyState.tsx",
      "Field.tsx",
      "PageMark.tsx",
      // M39, ISC-505, and on the same terms as every entry above: added to the
      // list rather than the list being loosened. `Popover.tsx` is the shell
      // CellPopover already was — the measured flip-then-clamp placement, the
      // delayed close, and the one Escape-scroll-resize listener the keyboard
      // model allows outside itself — extracted because a second hover box would
      // otherwise rediscover the three failure modes CellPopover's header names.
      // `ProvenancePopover.tsx` is the one caller that is a primitive in its own
      // right: two surfaces mount it, over three fields, and a third would
      // otherwise compose the trigger and the box by hand.
      "Popover.tsx",
      "ProvenancePopover.tsx",
      "RelationMark.tsx",
      // M32 R8: the row, on the same terms as the three before it — four
      // surfaces were drawing a list four ways and three of them as card stacks.
      "Row.tsx",
      // M39, ISC-503, and both on the same terms as everything above. `Sheet`
      // is the native-<dialog> frame `ShortcutSheet` and `RecordPanel` were each
      // writing for themselves, extracted when the Design companion needed a
      // third copy; all three mount it now, so the focus trap and the Escape
      // behaviour are one implementation rather than three that agree.
      // `Separator` is the draggable divider, which is a control with an ARIA
      // contract — role, orientation, value, bounds, arrows, Home and End — and
      // a control with a contract is exactly what belongs here rather than
      // inline in the one surface that happens to need it first.
      "Separator.tsx",
      "Sheet.tsx",
      "StatusChip.tsx",
      "decisions.ts",
      "index.ts",
      "inert.tsx",
    ]);
  });

  test("the barrel exports every component and every pure helper beside it", async () => {
    // A helper that is reachable only by importing the .tsx directly is one a
    // surface builder will reimplement.
    const barrel = await source("index.ts");
    for (const name of [
      "EmptyState",
      "emptyStateModel",
      "DecisionGroup",
      "decisionTabOrder",
      "Disclosure",
      "Field",
      "fieldAria",
      "StatusChip",
      "chipModel",
      "DECISION_VERBS",
      "decisionRoles",
      // Both forms of the arrowhead, because the reason this primitive exists
      // is that its two callers are a React tree and a string builder.
      "ArrowMarker",
      "arrowMarkerSvg",
      "arrowMarkerRef",
    ]) {
      expect(barrel).toContain(name);
    }
  });

  test("none of them writes to the ledger or spends a model call", async () => {
    // The governing rule every surface inherits: no primitive may accept a
    // page, dispose of a finding, spend a model call or write a file. They take
    // callbacks; the surface owns the append. A primitive that appended would
    // put an accept one keystroke away the moment the keyboard model lands.
    const offenders: string[] = [];
    for await (const rel of new Glob("*.{ts,tsx}").scan(ROOT)) {
      const text = await Bun.file(`${ROOT}${rel}`).text();
      if (/append|useLedger|runInference|fetch\(/.test(code(text))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  test("Anti: that probe would fire on an append", () => {
    expect(/append|useLedger/.test("await appendAll(events);")).toBe(true);
  });

  test("none of them navigates on its own", async () => {
    // The finding's location is an anchor the researcher follows, never a
    // push the component performs, so the browser's own back button is the
    // whole undo story.
    const offenders: string[] = [];
    for await (const rel of new Glob("*.{ts,tsx}").scan(ROOT)) {
      const text = code(await Bun.file(`${ROOT}${rel}`).text());
      if (/location\.hash\s*=|history\.push|navigate\(/.test(text)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});

describe("the primitive stylesheet does not fight base.css", () => {
  const selectors = (css: string): readonly string[] => {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const out: string[] = [];
    for (const m of stripped.matchAll(/(^|\})([^{}@]+)\{/g)) {
      for (const part of (m[2] ?? "").split(",")) {
        const sel = part.trim().replace(/\s+/g, " ");
        if (sel !== "" && !sel.startsWith("@")) out.push(sel);
      }
    }
    return out;
  };

  test("no selector is declared in both base.css and components.css", async () => {
    // base.css belongs to Foundations and holds the first pass at these six
    // roles; components.css holds what the primitives grew when they were built
    // out. Splitting a role across two files is only safe while no selector
    // appears in both, because the moment one does the rendering depends on the
    // import order in index.ts and nothing at either site says so.
    const base = new Set(selectors(await Bun.file(`${STYLES}base.css`).text()));
    const mine = selectors(await Bun.file(`${STYLES}components.css`).text());
    expect(mine.filter((s) => base.has(s))).toEqual([]);
  });

  test("Anti: the selector reader finds real selectors in both files", async () => {
    const base = selectors(await Bun.file(`${STYLES}base.css`).text());
    const mine = selectors(await Bun.file(`${STYLES}components.css`).text());
    expect(base).toContain(".empty-state");
    expect(base.length).toBeGreaterThan(60);
    expect(mine.length).toBeGreaterThan(15);
    expect(mine).toContain(".field-row > .field-error");
  });

  test("every class the components render has a rule in one of the two files", async () => {
    // Thirty-one classNames in the app rendered with no CSS rule at all and
    // four whole surfaces came out unstyled. A primitive shipping a class that
    // nothing draws is how that starts again.
    // M32 R8: three files, not two. The row primitive's rules are rows.css,
    // which is where the layer's second half went so that four surfaces could
    // override its padding without overriding components.css. What this
    // protects is unchanged and unweakened: a primitive may not ship a class
    // that nothing draws.
    const css = [
      await Bun.file(`${STYLES}base.css`).text(),
      await Bun.file(`${STYLES}components.css`).text(),
      await Bun.file(`${STYLES}rows.css`).text(),
    ].join("\n");
    const used = new Set<string>();
    for await (const rel of new Glob("*.tsx").scan(ROOT)) {
      const text = code(await Bun.file(`${ROOT}${rel}`).text());
      for (const m of text.matchAll(/className="([^"]+)"/g)) {
        for (const cls of (m[1] ?? "").split(/\s+/)) if (cls !== "") used.add(cls);
      }
    }
    expect(used.size).toBeGreaterThan(15);
    const orphans = [...used].filter((cls) => !css.includes(`.${cls}`));
    expect(orphans).toEqual([]);
  });
});
