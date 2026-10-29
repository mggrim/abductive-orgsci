/**
 * M61 follow-up, ISC-590: the walkthrough's four screens and the long front
 * page tell the sections in one order, so the two never disagree (owner,
 * 2026-09-30): the nine early problems, the two loops, what Abductive will not
 * do, and the data sentence. Where things live has no section on the long page
 * and the create block heads it, which are the long page's own differences.
 */
import { describe, expect, test } from "bun:test";

const SRC = new URL("../src/ui/", import.meta.url).pathname;
const code = async (f: string) =>
  (await Bun.file(SRC + f).text()).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SHARED = ["OBSTACLES_LEDE", "STEPS_LEDE", "COMMITMENTS_HEADING", "DATA_LIVES_BODY"] as const;

function orderIn(text: string, from: number): number[] {
  return SHARED.map((name) => text.indexOf(`{${name}`, from));
}

describe("ISC-590: one order on both surfaces", () => {
  test("the walkthrough's screens run problems, loops, refusals, data", async () => {
    const walk = await code("Walkthrough.tsx");
    const at = orderIn(walk, walk.indexOf("function Screen("));
    for (const i of at) expect(i).toBeGreaterThan(-1);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  test("the long page runs its sections in the same order", async () => {
    const intro = await code("Introduction.tsx");
    const at = orderIn(intro, intro.indexOf("export function Introduction("));
    for (const i of at) expect(i).toBeGreaterThan(-1);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
});
