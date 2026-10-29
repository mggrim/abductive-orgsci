/**
 * M53, ISC-542: the three.js scenes and the dependency are gone.
 *
 * The owner, the day ISC-539 shipped them: "Get rid of the 3js images." The
 * walkthrough's backdrops are the six photographs the long front page has
 * carried since M32 (ISC-543, tests/m53-backdrops.test.ts).
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe("the scenes are gone (ISC-542)", () => {
  test("no source module imports three.js", () => {
    const offenders = files(SRC)
      .filter((p) => /\.(tsx?|css)$/.test(p))
      .filter((p) => /from\s+["']three["']|import\(["']three["']\)/.test(readFileSync(p, "utf8")));
    expect(offenders).toEqual([]);
  });

  test("the package carries neither three nor its types", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    for (const block of ["dependencies", "devDependencies"]) {
      expect(Object.keys(pkg[block] ?? {})).not.toContain("three");
      expect(Object.keys(pkg[block] ?? {})).not.toContain("@types/three");
    }
  });

  test("the scene modules and their mount are deleted, not orphaned", () => {
    for (const gone of ["IntroScene.tsx", "IntroSceneStill.tsx", "WalkScene.tsx", "sceneGate.ts", "sceneGeometry.ts"]) {
      expect({ gone, present: existsSync(join(SRC, "ui/intro", gone)) }).toEqual({ gone, present: false });
    }
    const walk = readFileSync(join(SRC, "ui/Walkthrough.tsx"), "utf8");
    expect(walk).not.toContain("WalkScene");
    const css = files(join(SRC, "ui/styles")).map((p) => readFileSync(p, "utf8")).join("\n");
    expect(css).not.toMatch(/\.walk-scene\b/);
  });

  test("the step rail no longer reports the step under the pointer, which only the scene read", () => {
    const intro = readFileSync(join(SRC, "ui/Introduction.tsx"), "utf8");
    expect(intro).not.toContain("onActive");
  });

  test("a built index, where one exists, references no scene chunk", () => {
    const dist = join(ROOT, "dist");
    if (!existsSync(join(dist, "index.html"))) return;
    const assets = existsSync(join(dist, "assets")) ? readdirSync(join(dist, "assets")) : [];
    expect(assets.filter((a) => /IntroScene|three/i.test(a))).toEqual([]);
    const index = readFileSync(join(dist, "index.html"), "utf8");
    expect(index).not.toMatch(/IntroScene|three/i);
  });
});
