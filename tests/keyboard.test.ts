/**
 * The keyboard model, and the rule it exists under (FND-02).
 *
 * The survey found no keyboard model at all: one Escape handler in
 * CellPopover, zero uses of tabIndex, and a bias grid presenting 63 squares as
 * 63 tab stops. Adding one is the largest workflow gain available against
 * either incumbent. It is also the fastest way to break the product's central
 * commitment, because the moment a bare letter can dispose of a finding, the
 * ledger records a judgement the researcher did not make.
 *
 * So the first block here is not a unit test, it is the rule:
 *
 *   No single keystroke may accept a page, dispose of a finding, spend a model
 *   call or write a file. Speed is granted to navigation and to declining,
 *   never to accepting. Accelerators on those actions move focus; the
 *   researcher presses.
 *
 * It is checked three ways, because each one alone is defeatable. The union
 * check says no binding is wired to such an act. The label check says a
 * binding that points at one is named for the movement rather than for the
 * act, so the sheet cannot promise something the hook does not do. And the
 * source scan reads every file in the directory for the shapes that would slip
 * an act past both: a synthesised click, a form submit, an import of the
 * ledger, the inference boundary or the export bundle. A keystroke that called
 * `.click()` on the accept button would pass the first two checks and violate
 * the rule completely.
 */

import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import {
  BINDINGS,
  INTENT_KINDS,
  LISTENED,
  PREFIXES,
  SECTIONS,
  bindingsInScope,
  type Binding,
} from "../src/ui/keyboard/bindings.ts";
import { ROVING_GROUPS } from "../src/ui/keyboard/roving.ts";
import { TARGET_SELECTORS, ariaKeyshortcut } from "../src/ui/keyboard/targets.ts";
import {
  CHORD_TIMEOUT_MS,
  isTypingTarget,
  keyCaps,
  modLabel,
  resolveStroke,
  strokeToken,
  type KeyStroke,
} from "../src/ui/keyboard/chords.ts";
import { STATIONS } from "../src/flow/stations.ts";
import { STUDY_TABS, STUDY_TAB_LABEL } from "../src/ui/routes.ts";

const DIR = new URL("../src/ui/keyboard/", import.meta.url).pathname;

async function keyboardSources(): Promise<readonly { file: string; text: string }[]> {
  const out: { file: string; text: string }[] = [];
  for await (const rel of new Glob("**/*.{ts,tsx}").scan(DIR)) {
    out.push({ file: rel, text: await Bun.file(`${DIR}${rel}`).text() });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

const SOURCES = await keyboardSources();

/** Comments discuss the acts that are forbidden, so the scan reads code only. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("the governing rule: speed goes to navigation and to declining", () => {
  test("the files are there, so nothing below passes on an empty glob", () => {
    expect(SOURCES.length).toBeGreaterThan(6);
    expect(SOURCES.map((s) => s.file)).toContain("bindings.ts");
    expect(BINDINGS.length).toBeGreaterThan(20);
  });

  test("no binding is wired to an accepting, spending or writing act", () => {
    // The four movements a binding may carry, and the intents that implement
    // them. Every one is a route change, a focus move or an overlay. Widening
    // either list is the code review this rule is meant to force.
    //
    // Restated at MAT-03, not weakened. The list gained a ninth member,
    // `browser-opens-a-fold`, and the property the list protects is unchanged:
    // no member of this union can append to the ledger, call a model or write a
    // file. The ninth is the strongest case of that rather than an exception,
    // because it is the one intent this layer performs no work for at all. It
    // exists so the generated sheet can say that Enter opens a fold, which is
    // how a passage on /material is read and therefore how the attention layer
    // records anything. The two assertions under it are the new half: a member
    // the layer does not perform must carry no payload to perform it with, and
    // must not be in the set the matcher installs listeners for.
    const EFFECTS = ["navigate", "focus", "reveal", "dismiss-overlay"];
    const offenders: string[] = [];
    for (const b of BINDINGS) {
      if (!EFFECTS.includes(b.effect)) offenders.push(`${b.id}: effect ${b.effect}`);
      if (!(INTENT_KINDS as readonly string[]).includes(b.intent.kind)) {
        offenders.push(`${b.id}: intent ${b.intent.kind}`);
      }
    }
    expect(offenders).toEqual([]);
    expect(INTENT_KINDS).toEqual([
      "browser-opens-a-fold",
      "go-tab",
      "cycle-tab",
      "go-station",
      "go-route",
      "focus",
      "rove",
      "open",
      "close-overlay",
    ]);

    const native = BINDINGS.filter((b) => b.intent.kind === "browser-opens-a-fold");
    expect(native).toHaveLength(1);
    for (const b of native) {
      expect(Object.keys(b.intent)).toEqual(["kind"]);
      expect(LISTENED.map((x) => x.id)).not.toContain(b.id);
      // And nothing in the app advertises it as a shortcut on a control, since
      // the stamp is applied from LISTENED and this row is not in it.
      expect(b.control).toBeUndefined();
    }
  });

  test("a binding that points at an accepting or spending control is named for the move", () => {
    // Mod+Enter is the one every reviewer asks about. It reads as "send" in
    // every other tool and it does not send here: it puts focus on the send
    // button. The label has to say so, because a sheet that reads "Send" over
    // a key that moves focus is a sheet that lies about the rule.
    const acts = /\b(accept|accepts|send|sends|decline|declines|dismiss|dispose|delete|draft|generate|download|save)\b/i;
    for (const b of BINDINGS) {
      if (!acts.test(b.label)) continue;
      expect(`${b.id}: ${b.effect}`).toBe(`${b.id}: focus`);
      expect(b.label.startsWith("Go to")).toBe(true);
      // And it says what happens next, in the sheet, next to the chord.
      expect(b.note ?? "").toMatch(/press|record/i);
    }
  });

  test("the label's opening verb is fixed by what the binding does", () => {
    const OPENER: Readonly<Record<string, string>> = {
      navigate: "Go to",
      focus: "Go to",
      reveal: "Open",
      "dismiss-overlay": "Close",
    };
    const offenders = BINDINGS.filter((b) => !b.label.startsWith(OPENER[b.effect] ?? "\u0000")).map(
      (b) => `${b.id}: ${b.label}`,
    );
    expect(offenders).toEqual([]);
  });

  test("nothing in the directory can perform one of the four acts", () => {
    // The check the other two cannot make. A keystroke that called .click() on
    // the accept button, or requestSubmit on the answer form, would satisfy
    // every assertion above and break the rule outright.
    const forbidden: readonly (readonly [RegExp, string])[] = [
      [/\.click\s*\(/, "a synthesised click"],
      [/requestSubmit|\.submit\s*\(/, "a form submit"],
      [/dispatchEvent\s*\(/, "a synthesised event"],
      [/from "\.\.\/\.\.\/(ledger|inference|export|personas|lint)\//, "an import of a writing or spending module"],
      [/appendEvent|appendToLedger|useLedger/, "the ledger"],
      [/\bfetch\s*\(/, "a network call"],
      [/localStorage|indexedDB|showSaveFilePicker/, "a write to storage"],
    ];
    const offenders: string[] = [];
    for (const { file, text } of SOURCES) {
      for (const [pattern, what] of forbidden) {
        if (pattern.test(code(text))) offenders.push(`${file}: ${what}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("Anti: the source scan fires on the shape it is meant to catch", () => {
    // Vacuity guard. Without this the block above passes on any directory,
    // including an empty one, and says nothing.
    const smuggled = code(`
      function run() {
        document.querySelector('[data-role="accept"]')?.click();
      }
    `);
    expect(/\.click\s*\(/.test(smuggled)).toBe(true);
    expect(/\.click\s*\(/.test(code("// el.click() in a comment\n"))).toBe(false);
  });

  test("the focus targets end at focus, and the palette goes places only", () => {
    const targets = SOURCES.find((s) => s.file === "targets.ts")?.text ?? "";
    expect(targets).toContain("focus");
    expect(code(targets)).not.toMatch(/\.click|\.submit/);
    const palette = SOURCES.find((s) => s.file === "CommandPalette.tsx")?.text ?? "";
    // The runtime guard, not the filter: widening the filter alone must not
    // widen what the palette can reach.
    expect(code(palette)).toContain('binding.effect !== "navigate"');
  });
});

describe("the table is the one declaration", () => {
  test("ids and chords are unique within a scope", () => {
    const ids = BINDINGS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    const chords = LISTENED.map((b) => `${b.scope}:${b.keys}`);
    expect(new Set(chords).size).toBe(chords.length);
  });

  test("a global chord does not collide with a study chord", () => {
    // Scope is about what a key means, not about hiding a collision: inside a
    // study both sets are live at once, so a duplicate would be a coin toss.
    const inStudy = bindingsInScope("study").filter((b) => b.keys !== "Arrow keys");
    const keys = inStudy.map((b) => b.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("no bare key shadows a sequence prefix", () => {
    // A binding on plain g would fire before g d ever resolved, and the sheet
    // would print both.
    const shadowed = LISTENED.filter((b) => PREFIXES.has(b.keys)).map((b) => b.id);
    expect(shadowed).toEqual([]);
    expect(PREFIXES.has("g")).toBe(true);
  });

  test("all six views and all eight stations are bound, in the order they are declared", () => {
    // The rows are generated from STUDY_TABS and STATIONS rather than typed
    // out, which is the guard: a ninth station or a renamed tab moves the sheet
    // with it. This asserts the generation is still what it claims.
    const tabs = BINDINGS.filter((b) => b.intent.kind === "go-tab");
    expect(tabs.map((b) => (b.intent.kind === "go-tab" ? b.intent.tab : ""))).toEqual([
      ...STUDY_TABS,
    ]);
    for (const b of tabs) {
      if (b.intent.kind !== "go-tab") continue;
      expect(b.label).toBe(`Go to ${STUDY_TAB_LABEL[b.intent.tab]}`);
      expect(b.keys.startsWith("g ")).toBe(true);
    }

    const stations = BINDINGS.filter((b) => b.intent.kind === "go-station");
    expect(stations.map((b) => b.keys)).toEqual(STATIONS.map((_s, i) => String(i + 1)));
    expect(stations.map((b) => (b.intent.kind === "go-station" ? b.intent.station : ""))).toEqual(
      STATIONS.map((s) => s.id),
    );
  });

  test("every binding sits in a declared section and says something", () => {
    const sections = new Set(SECTIONS.map((s) => s.id));
    for (const b of BINDINGS) {
      expect(sections.has(b.section)).toBe(true);
      expect(b.label.length).toBeGreaterThan(4);
    }
    // Every section earns its heading on at least one scope.
    for (const s of SECTIONS) {
      const rows = bindingsInScope("study").filter((b) => b.section === s.id);
      expect(`${s.id}: ${rows.length > 0}`).toBe(`${s.id}: true`);
    }
  });

  test("the table speaks the tool's voice and never says it gates", () => {
    // House rules. Nothing gates, findings are observations, declining is
    // first class. The sheet prints these strings verbatim.
    const gating = /until you|before you can|you must|required|not allowed|blocked|locked/i;
    for (const b of BINDINGS) {
      const prose = `${b.label} ${b.note ?? ""}`;
      expect(prose).not.toMatch(/[—–]/);
      expect(prose).not.toMatch(gating);
    }
    for (const s of SECTIONS) {
      expect(`${s.title} ${s.note ?? ""}`).not.toMatch(/[—–]/);
    }
  });

  test("only chords that declared themselves safe fire while typing", () => {
    // Every one of them carries a modifier or is Escape. A bare letter live in
    // a textarea is the defect this flag exists to prevent.
    for (const b of LISTENED.filter((x) => x.whileTyping === true)) {
      expect(`${b.id}: ${b.keys.includes("Mod+") || b.keys === "Escape"}`).toBe(`${b.id}: true`);
    }
  });
});

describe("the sheet is generated, so it cannot drift", () => {
  const sheet = SOURCES.find((s) => s.file === "ShortcutSheet.tsx")?.text ?? "";

  test("it is a native dialog", async () => {
    /* Restated at M39 (ISC-503), not weakened. The four lines this asserted —
     * the element, `showModal`, the native close event and the heading — were
     * the same four `RecordPanel` wrote and the same four the Design companion's
     * sheet needed, so they moved into `ui/components/Sheet.tsx` and this file
     * renders that. The property is unchanged and is what the assertion follows:
     * the sheet on `?` is a platform dialog, so focus is trapped and handed
     * back, Escape closes it, and the page behind it is inert.
     *
     * Asserting `<dialog` here after the move would have passed on the word in
     * the file's own header comment, which is a vacuous guard of exactly the
     * kind this suite calls worse than none. */
    expect(sheet).toContain("<Sheet");
    const shell = await Bun.file(
      new URL("../src/ui/components/Sheet.tsx", import.meta.url),
    ).text();
    expect(shell).toContain("<dialog");
    expect(shell).toContain("showModal()");
  });

  test("it reads the table rather than restating it", () => {
    expect(sheet).toContain("bindingsInSection");
    expect(sheet).toContain("SECTIONS");
    // No chord and no label is written down anywhere but bindings.ts. This is
    // the assertion that stops a well meant hand edit from documenting a key
    // the hook does not have.
    const offenders: string[] = [];
    for (const b of BINDINGS) {
      if (sheet.includes(`"${b.keys}"`) || sheet.includes(`>${b.label}<`)) offenders.push(b.id);
    }
    expect(offenders).toEqual([]);
  });

  test("it states the governing rule where the shortcuts are", () => {
    const rule = sheet.slice(sheet.indexOf("kbd-rule"));
    expect(rule).toMatch(/The keys that point at the controls to accept a claim/);
    expect(rule).toMatch(/You press the control yourself/);
  });

  test("the caps renderer covers every chord in the table", () => {
    for (const b of BINDINGS) {
      const caps = keyCaps(b.keys);
      expect(caps.length).toBeGreaterThan(0);
      expect(caps.every((c) => c.length > 0)).toBe(true);
    }
    expect(keyCaps("Mod+Shift+D")).toEqual(["Mod", "Shift", "D"]);
    expect(modLabel("MacIntel")).toBe("Cmd");
    expect(modLabel("Win32")).toBe("Ctrl");
  });
});

describe("input suppression", () => {
  test("a field with a caret in it swallows bare keys", () => {
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTypingTarget({ tagName: "INPUT", type: "text" })).toBe(true);
    expect(isTypingTarget({ tagName: "INPUT", type: "search" })).toBe(true);
    expect(isTypingTarget({ tagName: "INPUT", type: "password" })).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", role: "textbox" })).toBe(true);
  });

  test("a control that takes no text does not", () => {
    // Suppressing on a checkbox would cost the bindings for no gain: no bare
    // key types anything there.
    expect(isTypingTarget({ tagName: "INPUT", type: "checkbox" })).toBe(false);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget({ tagName: "A" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  test("the hook consults the flag rather than the key", () => {
    const hook = SOURCES.find((s) => s.file === "useHotkeys.ts")?.text ?? "";
    expect(code(hook)).toContain("isTypingTarget");
    expect(code(hook)).toContain("whileTyping === true");
    // And a sequence cannot be started from inside a field at all.
    expect(code(hook)).toContain("new Set<string>()");
  });
});

describe("chords resolve the way the sheet prints them", () => {
  const stroke = (key: string, mods: Partial<KeyStroke> = {}): KeyStroke => ({
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  });

  test("Mod is one token for two platforms", () => {
    expect(strokeToken(stroke("k", { metaKey: true }))).toBe("Mod+K");
    expect(strokeToken(stroke("k", { ctrlKey: true }))).toBe("Mod+K");
    expect(strokeToken(stroke("Enter", { metaKey: true }))).toBe("Mod+Enter");
    expect(strokeToken(stroke("D", { metaKey: true, shiftKey: true }))).toBe("Mod+Shift+D");
  });

  test("a shifted character is the character, not Shift plus the key under it", () => {
    // ? arrives as ? and printing it as Shift+/ would put a key on the sheet
    // that nobody presses.
    expect(strokeToken(stroke("?", { shiftKey: true }))).toBe("?");
    expect(strokeToken(stroke("/"))).toBe("/");
    expect(strokeToken(stroke("G"))).toBe("g");
    expect(strokeToken(stroke("Escape"))).toBe("Escape");
  });

  test("g then d goes to Design, and g then z goes nowhere", () => {
    const first = resolveStroke(LISTENED, null, "g", PREFIXES);
    expect(first.status).toBe("pending");
    expect(first.pending).toBe("g");

    const second = resolveStroke(LISTENED, "g", "d", PREFIXES);
    expect(second.status).toBe("match");
    expect(second.binding?.id).toBe("go-tab-design");

    // A mistyped second key clears rather than falling through to whatever
    // that key is bound to on its own. g then b must not land on Biases twice.
    const missed = resolveStroke(LISTENED, "g", "z", PREFIXES);
    expect(missed.status).toBe("none");
    expect(missed.pending).toBe(null);
  });

  test("a held prefix does not wait forever", () => {
    expect(CHORD_TIMEOUT_MS).toBeGreaterThan(500);
    expect(CHORD_TIMEOUT_MS).toBeLessThan(4000);
    const hook = SOURCES.find((s) => s.file === "useHotkeys.ts")?.text ?? "";
    expect(code(hook)).toContain("setTimeout(clear");
  });

  test("single keys resolve straight through", () => {
    expect(resolveStroke(LISTENED, null, "?", PREFIXES).binding?.id).toBe("open-sheet");
    expect(resolveStroke(LISTENED, null, "Mod+K", PREFIXES).binding?.id).toBe("open-palette");
    expect(resolveStroke(LISTENED, null, "/", PREFIXES).binding?.id).toBe("focus-primary-input");
    expect(resolveStroke(LISTENED, null, "3", PREFIXES).binding?.id).toBe(
      `go-station-${STATIONS[2]?.id}`,
    );
    expect(resolveStroke(LISTENED, null, "q", PREFIXES).status).toBe("none");
  });
});

describe("roving tabindex", () => {
  test("the rail and the bias grid are one tab stop each", () => {
    const ids = ROVING_GROUPS.map((g) => g.id);
    expect(ids).toContain("rail");
    expect(ids).toContain("bias-grid");
    const grid = ROVING_GROUPS.find((g) => g.id === "bias-grid");
    expect(grid?.layout).toBe("grid");
    // A grid without a row selector walks 63 cells in one line, which is a
    // list wearing a table's clothes.
    expect(grid?.row).toBeDefined();
  });

  test("the selectors match what those two surfaces actually render", async () => {
    // Both files belong to other builders this wave. Matching by selector is
    // what let the model ship before they opened them, and this is the guard
    // that a class rename fails here rather than removing the arrows in
    // silence.
    const rail = await Bun.file(new URL("../src/flow/StationRail.tsx", import.meta.url)).text();
    expect(rail).toContain('className="rail-item"');
    expect(rail).toContain('className="rail"');
    // M63, ISC-611: the bias grid, the roving grid this also read, went with the
    // readiness report; its biases are a list of sentences now.
  });

  test("there is a declared contract for the surfaces built next", () => {
    const declared = ROVING_GROUPS.filter((g) => g.container.includes("data-roving"));
    expect(declared.length).toBe(2);
    expect(declared.map((g) => g.layout).sort()).toEqual(["grid", "list"]);
  });

  test("the controller moves focus and never presses", () => {
    const roving = SOURCES.find((s) => s.file === "roving.ts")?.text ?? "";
    expect(code(roving)).toContain(".focus()");
    expect(code(roving)).not.toContain(".click(");
    // Tab must still leave the group, which is the whole point of roving.
    expect(code(roving)).toContain("tabIndex = ");
  });
});

describe("aria-keyshortcuts", () => {
  test("a chord becomes both platform spellings", () => {
    expect(ariaKeyshortcut("Mod+K")).toBe("Meta+K Control+K");
    expect(ariaKeyshortcut("Mod+Shift+D")).toBe("Meta+Shift+D Control+Shift+D");
    expect(ariaKeyshortcut("/")).toBe("/");
    expect(ariaKeyshortcut("1")).toBe("1");
  });

  test("a sequence is not stamped, because ARIA cannot say it", () => {
    // aria-keyshortcuts is a space separated list of alternatives, so "g d"
    // would be announced as "g or d". A wrong shortcut read aloud is worse
    // than none, and the sequence goes on data-kbd-chord instead.
    expect(ariaKeyshortcut("g d")).toBe(null);
    const targets = SOURCES.find((s) => s.file === "targets.ts")?.text ?? "";
    expect(targets).toContain("data-kbd-chord");
  });

  test("the bindings that name a control name one that exists in the app", () => {
    const withControl = BINDINGS.filter((b) => b.control !== undefined);
    expect(withControl.length).toBeGreaterThan(10);
    for (const b of withControl) {
      expect(b.control ?? "").not.toBe("");
    }
  });

  test("every focus target has at least one selector, and the contract first", () => {
    for (const [name, selectors] of Object.entries(TARGET_SELECTORS)) {
      expect(selectors.length).toBeGreaterThan(0);
      expect(`${name}: ${selectors[0]?.includes("data-kbd") === true}`).toBe(`${name}: true`);
    }
  });
});

describe("the layer is the only mount point", () => {
  test("AppShell mounts it once and nothing else installs a listener", async () => {
    const shell = await Bun.file(new URL("../src/ui/AppShell.tsx", import.meta.url)).text();
    expect(shell).toContain("<KeyboardLayer />");
    expect([...shell.matchAll(/<KeyboardLayer/g)]).toHaveLength(1);
  });

  test("the intent switch is exhaustive over the union", () => {
    // noFallthroughCasesInSwitch and the closed union do the compiler's half.
    // This is the half that says a new member cannot be quietly ignored.
    const layer = SOURCES.find((s) => s.file === "KeyboardLayer.tsx")?.text ?? "";
    for (const kind of INTENT_KINDS) expect(layer).toContain(`case "${kind}"`);
  });

  test("the app has exactly one keydown listener outside the keyboard model", async () => {
    // CellPopover's Escape handler is the one that predates this and it is
    // scoped to an open popover. A second ad hoc listener appearing in a
    // surface file is the drift this model was built to end, so it shows up
    // here as a failure with the file named.
    //
    // M39, ISC-505. The named file changed and the count did not, which is the
    // point. The provenance box needs the identical Escape-scroll-resize
    // behaviour, so rather than a second copy the listener moved into
    // `ui/components/Popover.tsx` as `useDismissOnEscapeOrMove`, and CellPopover
    // is one of its two callers. Restated rather than loosened: still exactly
    // one file, and adding a third popover costs nothing here as long as it uses
    // the shell.
    const found: string[] = [];
    for (const dir of ["ui", "flow", "workbench", "views", "twin", "auth"]) {
      const root = new URL(`../src/${dir}/`, import.meta.url).pathname;
      for await (const rel of new Glob("**/*.{ts,tsx}").scan(root)) {
        if (rel.startsWith("keyboard/")) continue;
        const text = await Bun.file(`${root}${rel}`).text();
        if (/addEventListener\(\s*"keydown"/.test(code(text))) found.push(`${dir}/${rel}`);
      }
    }
    expect(found).toEqual(["ui/components/Popover.tsx"]);
  });
});

/** The shape of a binding the type system alone would let through. */
function fake(overrides: Partial<Binding>): Binding {
  return {
    id: "fake",
    keys: "z",
    label: "Go to nowhere",
    section: "move",
    scope: "global",
    effect: "navigate",
    intent: { kind: "go-route", hash: "#/" },
    ...overrides,
  };
}

test("Anti: the rule's checks fail on a binding that breaks it", () => {
  // Without this the whole first block could be passing because the table is
  // small and well behaved rather than because the checks work.
  const acts = /\b(accept|accepts|send|sends|decline|declines|dismiss|dispose|delete|draft|generate|download|save)\b/i;
  const bad = fake({ id: "bad", label: "Send the answer", effect: "navigate" });
  expect(acts.test(bad.label)).toBe(true);
  expect(bad.effect === "focus").toBe(false);
  const opener = fake({ id: "worse", label: "Accept the page", effect: "focus" });
  expect(opener.label.startsWith("Go to")).toBe(false);
});
