/**
 * M54, ISC-547. The bridge ships with the site as `public/bridge.ts`, made
 * from `scripts/cli-bridge.ts` by the build, so there is one source. A reader
 * on the hosted site downloads the same program a checkout runs.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url).pathname;

describe("ISC-547: the shipped bridge is the one source", () => {
  test("public/bridge.ts matches scripts/cli-bridge.ts byte for byte", () => {
    const source = readFileSync(`${ROOT}scripts/cli-bridge.ts`, "utf8");
    const shipped = readFileSync(`${ROOT}public/bridge.ts`, "utf8");
    expect(shipped === source).toBe(true);
  });

  test("the build generates it before Vite copies public/", () => {
    const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, "utf8")) as {
      scripts: Record<string, string>;
    };
    const build = pkg.scripts.build ?? "";
    expect(build.startsWith("bun scripts/ship-bridge.ts")).toBe(true);
    expect(build.indexOf("ship-bridge")).toBeLessThan(build.indexOf("vite build"));
  });

  test("the shipped file stands alone: its only import is from node itself", () => {
    const source = readFileSync(`${ROOT}scripts/cli-bridge.ts`, "utf8");
    const imports = [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
    expect(imports.every((i) => i?.startsWith("node:"))).toBe(true);
  });
});
