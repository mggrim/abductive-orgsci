/**
 * The inert control state (FND-03, FND-06).
 *
 * Round six found the hole this file exists to close, and the shape of it was
 * the same as rounds one through five: the rule was written down, one selector
 * was guarded, and the violation lived in a rule nobody globbed. base.css line
 * 350 was `button:disabled { opacity: 0.5; cursor: default }`, the entire
 * treatment for every button in the app, two hundred lines below a designed
 * pair for `input:disabled`. Measured live at 1440: seven inert controls on six
 * of the ten routes, every label 14px/400, "Create project" at 3.00:1 and the
 * other six at 3.34:1, and not one of them carrying a title, an aria-disabled,
 * an aria-describedby, or a sentence anywhere on the page saying what would
 * wake it.
 *
 * Why no existing test said anything. tests/styles-integrity.test.ts imports a
 * WCAG contrast() helper and spends it on four assertions that --notice,
 * --warn, --ok and --accent clear 4.5:1 against #ffffff, all four of which
 * already passed. It measured four tokens against a colour and never measured a
 * rendered state. So 830 tests were green over a control whose label a person
 * could not read.
 *
 * Two things get asserted here and they are different in kind.
 *
 * The appearance is a stylesheet fact: the state has a token triad, the triad
 * clears the same contrast bar as everything else, and no rule anywhere in the
 * directory expresses the state as alpha, because alpha dims fill, border and
 * label by one factor and is the absence of a design rather than one.
 *
 * The explanation is a source fact and it is the one that matters for the house
 * rule. A greyed unexplained primary is the canonical picture of a gate, and
 * the app was drawing one on the first action of the first two screens anybody
 * sees, in a tool whose first stated position is that nothing gates. So: every
 * control that is inert at rest states the condition that makes it live, and
 * the statement is visible on the page rather than living in a tooltip. The
 * scan below distinguishes at-rest from mid-write, because a control disabled
 * for the length of one append needs no paragraph and a paragraph that
 * flickered for 200ms would be worse than none.
 */

import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { contrast } from "./colour.ts";

const STYLES = new URL("../src/ui/styles/", import.meta.url).pathname;
const SRC = new URL("../src/", import.meta.url).pathname;

async function read(dir: string, pattern: string) {
  const out: { file: string; text: string }[] = [];
  for await (const rel of new Glob(pattern).scan(dir)) {
    out.push({ file: rel, text: await Bun.file(`${dir}${rel}`).text() });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

const SHEETS = await read(STYLES, "*.css");
const SOURCES = await read(SRC, "**/*.tsx");

function strip(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** The same for TSX, where a JSX comment is a block comment inside braces. */
function code(tsx: string): string {
  return tsx.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const TOKENS = (() => {
  const css = strip(SHEETS.find((s) => s.file === "tokens.css")?.text ?? "");
  const out = new Map<string, string>();
  for (const m of css.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) out.set(m[1] ?? "", (m[2] ?? "").trim());
  return out;
})();

/** Follow `var(--x)` aliases to the hex they land on. */
function resolve(name: string, depth = 0): string {
  const raw = TOKENS.get(name) ?? "";
  const alias = /^var\((--[a-z0-9-]+)\)$/.exec(raw);
  if (alias !== null && depth < 6) return resolve(alias[1] ?? "", depth + 1);
  return raw;
}

describe("inert is a designed state and not an alpha", () => {
  test("the triad exists and every member resolves to a colour", () => {
    // Vacuity guard first. Every assertion below reads these three, and an
    // empty parse would pass the contrast check against two empty strings.
    for (const name of ["--inert", "--inert-line", "--inert-fill"]) {
      expect(TOKENS.has(name)).toBe(true);
      expect(resolve(name)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  test("an inert label clears 4.5:1 on the surface it sits on", () => {
    // The measured defect, restated as a number the file can be held to. The
    // seven shipped controls ran 3.00:1 to 3.34:1 because opacity composited
    // the label toward whatever was behind it. WCAG exempts a disabled control
    // from 1.4.3, which is why nothing flagged this; the exemption is about
    // conformance rather than about whether a researcher can read "Connect".
    expect(contrast(resolve("--inert"), resolve("--inert-fill"))).toBeGreaterThan(4.5);
    // And the fill is distinguishable from the live surface beside it, or the
    // state is carried by the label colour alone.
    expect(resolve("--inert-fill")).not.toBe(resolve("--surface"));
  });

  test("no stylesheet expresses the state as opacity", () => {
    // The rule as shipped. `opacity: 0.5` on a filled primary dims fill, border
    // and white label together, which is how a control that means "not yet"
    // came to look like a control that means "not allowed".
    const offenders: string[] = [];
    for (const { file, text } of SHEETS) {
      for (const m of strip(text).matchAll(/([^{}]*:disabled[^{}]*)\{([^}]*)\}/g)) {
        if (/opacity\s*:/.test(m[2] ?? "")) offenders.push(`${file}: ${(m[1] ?? "").trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the state is declared after the roles it has to beat", () => {
    // `button:disabled` and `button.primary` are both 0-1-1, so the old rule,
    // sitting above the four role rules, lost the fill argument to every one of
    // them and only ever got to apply its alpha. Order is the whole fix and it
    // is invisible in a diff, which is why it is asserted.
    const base = strip(SHEETS.find((s) => s.file === "base.css")?.text ?? "");
    const inert = base.indexOf("button:disabled");
    expect(inert).toBeGreaterThan(0);
    for (const role of ["button.primary", "button.quiet", ".btn-bare", "button.danger"]) {
      expect(base.indexOf(role)).toBeLessThan(inert);
    }
  });

  test("fields and buttons are one state, not two treatments", () => {
    // `input:disabled` had a designed pair and buttons had alpha, which is how
    // the layer knew the state existed and skipped it. Both read the triad now,
    // and the field pair also moved off --ink-faint, which is 4.41:1 on
    // --surface-sunken and under the bar the rest of the app is held to.
    const base = strip(SHEETS.find((s) => s.file === "base.css")?.text ?? "");
    const fields = /input:disabled,[\s\S]*?\{([^}]*)\}/.exec(base)?.[1] ?? "";
    expect(fields).toContain("var(--inert-fill)");
    expect(fields).toContain("var(--inert)");
    expect(fields).not.toContain("--ink-faint");
  });

  test("Anti: the checks fail on the rule that shipped", () => {
    // Every assertion above passes on the current file. This is what they would
    // have said about the previous one.
    const shipped = "button:disabled,\n.btn:disabled {\n  opacity: 0.5;\n  cursor: default;\n}";
    const hits = [...shipped.matchAll(/([^{}]*:disabled[^{}]*)\{([^}]*)\}/g)].filter((m) =>
      /opacity\s*:/.test(m[2] ?? ""),
    );
    expect(hits).toHaveLength(1);
    // And the measured contrast of the two worst labels, so the 4.5 bar above
    // is not passing by measuring nothing.
    expect(contrast("#ffffff", "#949698")).toBeLessThan(3.5);
  });
});

/**
 * Every control that is inert at rest says what would wake it.
 *
 * The scan reads JSX rather than the DOM, and it is narrow on purpose: it looks
 * for the literal `disabled={` attribute and asks what expression is behind it.
 * Two shapes pass.
 *
 *   The expression is made only of the terms below, which all mean "a write is
 *   in flight". Momentary, self-explaining, gone before anyone could read a
 *   sentence about it.
 *
 *   The attribute is not written by hand at all, because the control spreads
 *   inertAttrs(), which cannot produce `disabled` without also producing a
 *   title and an aria-describedby pointing at a rendered sentence.
 *
 * Anything else is a control that sits dead on a screen for as long as some
 * condition holds and never names the condition, which is the defect.
 */
describe("an inert control names the condition that would make it live", () => {
  /**
   * Terms that mean "mid-write". `canRecordDecline` is here for a different
   * reason and it is the only exception: it is constant true by construction,
   * asserted as such in tests/primitives.test.ts, and it is read in
   * DecisionGroup precisely to say in code that declining is never withheld for
   * the want of a reason. Removing the call would delete that statement.
   */
  const TRANSIENT = ["busy", "pending", "inert", "isBusy", "saving", "canRecordDecline"];

  /**
   * Every place `disabled` is set by hand, with the expression behind it. Two
   * spellings, because the busy branches spread an object: the JSX attribute
   * `disabled={expr}`, and the object key `busy ? { disabled: true } : …`,
   * where the expression that matters is the ternary's condition rather than
   * the literal.
   */
  function handWritten(text: string): readonly string[] {
    const out = [...text.matchAll(/disabled=\{([^}]*)\}/g)].map((m) => (m[1] ?? "").trim());
    for (const m of text.matchAll(/([^\n?]{0,60})\?\s*\{\s*disabled:\s*[^},]+\s*\}/g)) {
      out.push((m[1] ?? "").trim());
    }
    // A bare `{ disabled: … }` with no condition in front of it is a control
    // that is dead unconditionally, which the scan should never let past.
    for (const m of text.matchAll(/(?<![?]\s{0,4})\{\s*disabled:\s*([^},]+)\s*\}/g)) {
      const before = text.slice(Math.max(0, (m.index ?? 0) - 4), m.index ?? 0);
      if (!before.includes("?")) out.push((m[1] ?? "").trim());
    }
    return out;
  }

  /**
   * Strip the transient terms and the operators; anything left is a condition.
   * A term takes its argument list with it, so `canRecordDecline(draft)` does
   * not leave `draft` behind and read as a condition of its own.
   */
  function residue(expr: string): string {
    let rest = expr;
    for (const t of TRANSIENT) {
      rest = rest.replace(new RegExp(`${t}\\s*\\([^)]*\\)`, "g"), "");
      rest = rest.split(t).join("");
    }
    return rest.replace(/[!()|&{}\[\],;\s.?:=<>null]/g, "");
  }

  test("the scan reached the files it is meant to read", () => {
    // Vacuity guard. An empty glob or a renamed extension would make every
    // assertion below pass while reading nothing, which is the exact way the
    // contrast helper in styles-integrity came to guard nothing for five rounds.
    expect(SOURCES.length).toBeGreaterThan(20);
    expect(SOURCES.some((s) => s.file.endsWith("AuthPanel.tsx"))).toBe(true);
    expect(SOURCES.flatMap((s) => handWritten(s.text)).length).toBeGreaterThan(3);
  });

  test("no hand-written disabled attribute carries a condition", () => {
    const offenders: string[] = [];
    for (const { file, text } of SOURCES) {
      for (const expr of handWritten(text)) {
        if (residue(expr) !== "") offenders.push(`${file}: disabled={${expr}}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("aria-disabled is written by the primitive and nowhere else", () => {
    // The state is aria-disabled rather than disabled precisely so the control
    // keeps its tab stop and the researcher reaches the sentence. Hand-writing
    // the attribute somewhere else would reproduce the defect with better
    // markup: reachable, dimmed, and silent about why.
    const offenders: string[] = [];
    for (const { file, text } of SOURCES) {
      if (file === "ui/components/inert.tsx") continue;
      // Comments stripped: this rule is about markup, and the comment in
      // AuthPanel that names the attribute is the file explaining itself.
      if (/aria-disabled/.test(code(text))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  test("every control that spreads inertAttrs renders the matching note", () => {
    // The pair is the primitive. A control wired to an aria-describedby whose
    // target never renders is worse than a bare one: it tells a screen reader
    // there is an explanation and then does not supply it.
    const missing: string[] = [];
    for (const { file, text } of SOURCES) {
      const wired = new Set(
        [...text.matchAll(/inertAttrs\(\s*"([^"]+)"/g)].map((m) => m[1] ?? ""),
      );
      const noted = new Set(
        [...text.matchAll(/<InertNote[\s\S]{0,120}?control="([^"]+)"/g)].map((m) => m[1] ?? ""),
      );
      for (const control of wired) if (!noted.has(control)) missing.push(`${file}: ${control}`);
    }
    expect(missing).toEqual([]);
  });

  test("the app has inert controls, and they go through the primitive", () => {
    // The counterpart to the check above: if every call site were deleted the
    // two assertions before this would pass over an app with no inert state at
    // all, and the defect would be gone for the wrong reason.
    const wired = SOURCES.flatMap(({ file, text }) =>
      [...text.matchAll(/inertAttrs\(\s*"([^"]+)"/g)].map((m) => `${file}:${m[1]}`),
    );
    // Was 5 until the "Sign in with Claude" control went with the token-paste
    // path. The number is a vacuity floor rather than a target, so it tracks
    // the count the app actually has; what it is guarding is that the two
    // tests above are reading a real set and not an empty one.
    expect(wired.length).toBeGreaterThanOrEqual(4);
  });

  test("the reasons are conditions and not instructions", () => {
    // Findings are observations, never actions, and a sentence under a dead
    // control is a finding about the state of the form. "Connect goes live once
    // a key is in the field above" is that. "You must enter a key before
    // continuing" is the register this app spent five rounds leaving behind,
    // and it is also the sentence that would turn the explanation into the gate
    // the greyed button was already implying.
    const imperative =
      /\b(you must|please |is required|you need to|before you can|not allowed|cannot proceed|you have to)\b/i;
    // Every reason is produced by a `…Reason(): string | null` function, which
    // is the convention that makes the sentences findable at all. The check
    // reads their bodies.
    const sentences: { file: string; text: string }[] = [];
    for (const { file, text } of SOURCES) {
      for (const m of text.matchAll(/function \w*Reason\([^)]*\): string \| null \{([\s\S]*?)\n\}/g)) {
        for (const lit of (m[1] ?? "").matchAll(/"([^"]{12,})"/g)) {
          sentences.push({ file, text: lit[1] ?? "" });
        }
      }
    }
    // Vacuity guard: the regex above is doing real work only if it found the
    // sentences the app actually renders.
    expect(sentences.length).toBeGreaterThanOrEqual(5);
    const offenders = sentences
      .filter((s) => imperative.test(s.text))
      .map((s) => `${s.file}: ${s.text}`);
    expect(offenders).toEqual([]);
    // No em dash or en dash either, since these strings are rendered prose and
    // arrive in the app through a file prose-discipline was not reading.
    const dashed = sentences.filter((s) => /[—–]/.test(s.text)).map((s) => s.file);
    expect(dashed).toEqual([]);
  });

  test("Anti: the scan catches the shape that shipped", () => {
    // The seven as they were written. Each one is a condition sitting in a bare
    // attribute with nothing beside it.
    const shipped = [
      `disabled={!dirty}`,
      `disabled={busy || title.trim() === ""}`,
      `disabled={!oauthConfigured}`,
      `disabled={!looksLikeToken(draft)}`,
      `disabled={chunks.length === 0 || busy !== null}`,
    ];
    for (const line of shipped) {
      const expr = handWritten(line)[0] ?? "";
      expect(residue(expr)).not.toBe("");
    }
    // And that the allowance is not swallowing everything: the transient shapes
    // still pass, or the check would be a ban on `disabled` rather than a bar.
    for (const line of [`disabled={busy}`, `disabled={inert}`, `disabled={busy !== null}`]) {
      expect(residue(handWritten(line)[0] ?? "")).toBe("");
    }
  });
});
