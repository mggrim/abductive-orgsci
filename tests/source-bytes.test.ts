/**
 * No source file carries a control byte (M33).
 *
 * `proposals/paperFit.ts` held a NUL where a space was meant, in the separator
 * of `framingDigest`. The digest it produced was fine: it separated the two
 * fields and compared equal to itself, which is the whole job. What the byte
 * cost was the file.
 *
 * Git decides a file is binary by looking for a NUL in the first few thousand
 * bytes, so every change to that module rendered as `Bin 16428 -> 21789 bytes`.
 * The whole of M33's work on the judge, which is the thing that decides what a
 * paper is for, went through unreviewable by diff and unreadable by anything
 * that reads a diff. A byte nobody can see turned off review for a file nobody
 * had noticed was off.
 *
 * It was three files, not one. `workbench/OntologyGraph.tsx` and
 * `tests/keyboard.test.ts` both used a raw NUL as a sentinel, which is a
 * legitimate technique: no page id and no key label can contain one, so nothing
 * can be mistaken for the separator. Both of those NULs sat under git's
 * threshold too, so both files were binary as far as review was concerned, and
 * neither had done anything wrong except type the byte instead of writing it.
 *
 * So the rule is about how a NUL is written rather than about whether one is
 * used. `"\u0000"` is the same string at runtime and ordinary text on disk. The
 * sentinels kept their behaviour and got their diffs back.
 *
 * A test rather than a fix, because the fix does not stay fixed. An invisible
 * character reaches a source file the same way it reached those three: a paste,
 * an editor, a generated patch. Tab, newline and carriage return are the three
 * that belong in a text file, and everything else below 0x20, plus DEL, is a
 * character nobody typed on purpose.
 */

import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

const ROOT = new URL("../", import.meta.url).pathname;

/** The three control characters a text file is allowed to hold. */
const ALLOWED = new Set([0x09, 0x0a, 0x0d]);

function controlBytes(bytes: Uint8Array): readonly number[] {
  const found = new Set<number>();
  for (const byte of bytes) {
    if (byte === 0x7f || (byte < 0x20 && !ALLOWED.has(byte))) found.add(byte);
  }
  return [...found].sort((a, b) => a - b);
}

const FILES: { path: string; bytes: Uint8Array }[] = [];
for (const pattern of ["src/**/*.{ts,tsx,css}", "tests/**/*.{ts,tsx}", "scripts/**/*.ts"]) {
  for await (const rel of new Glob(pattern).scan(ROOT)) {
    FILES.push({ path: rel, bytes: new Uint8Array(await Bun.file(`${ROOT}${rel}`).arrayBuffer()) });
  }
}
FILES.push({
  path: "index.html",
  bytes: new Uint8Array(await Bun.file(`${ROOT}index.html`).arrayBuffer()),
});

describe("every source file is text a diff can read", () => {
  test("no control byte outside tab, newline and carriage return", () => {
    const offenders = FILES.flatMap(({ path, bytes }) => {
      const found = controlBytes(bytes);
      return found.length === 0
        ? []
        : [`${path}: ${found.map((b) => `0x${b.toString(16).padStart(2, "0")}`).join(", ")}`];
    });
    expect(offenders.sort()).toEqual([]);
  });

  test("Anti: the scan read the files it claims to read", () => {
    // Vacuity guard. An empty file list passes the assertion above, which is
    // the failure mode every source-text check in this suite has.
    expect(FILES.length).toBeGreaterThan(100);
    const paths = FILES.map((f) => f.path);
    expect(paths).toContain("src/proposals/paperFit.ts");
    expect(paths).toContain("src/ui/ConceptsView.tsx");
    expect(paths).toContain("tests/keyboard.test.ts");
    expect(paths).toContain("index.html");
  });

  test("Anti: it catches the byte that started this", () => {
    // The exact shape of the defect: a NUL used as a separator inside a
    // template literal, which reads as ordinary source in every editor.
    const planted = new TextEncoder().encode("return `${a}\u0000${b}`;");
    expect(controlBytes(planted)).toEqual([0x00]);
    expect(controlBytes(new TextEncoder().encode("return `${a} ${b}`;\n\t"))).toEqual([]);
  });
});
