import { describe, expect, test } from "bun:test";

import { CASE_REFERENCED_CELL_IDS, MATRIX, getCell } from "../src/matrix/matrix.ts";
import { BIAS_IDS, SIGNAL_IDS, STAGE_IDS, validateMatrix } from "../src/matrix/schema.ts";

describe("matrix registry (ISC-10)", () => {
  test("has at least 16 populated cells", () => {
    expect(MATRIX.length).toBeGreaterThanOrEqual(16);
  });

  test("covers all 9 named biases", () => {
    const covered = new Set(MATRIX.map((c) => c.bias));
    for (const bias of BIAS_IDS) {
      expect(covered.has(bias)).toBe(true);
    }
    expect(covered.size).toBe(9);
  });

  /** Every bias must be reachable from ontology state, not only from stages. */
  test("every bias has at least one ontology-triggered cell", () => {
    const withOntologyTrigger = new Set(
      MATRIX.filter((c) => c.trigger.kind === "ontology").map((c) => c.bias),
    );
    for (const bias of BIAS_IDS) {
      expect(`${bias}:${withOntologyTrigger.has(bias)}`).toBe(`${bias}:true`);
    }
  });

  test("spans all 5 stages", () => {
    const covered = new Set(MATRIX.map((c) => c.stage));
    for (const stage of STAGE_IDS) {
      expect(covered.has(stage)).toBe(true);
    }
  });

  test("is structurally valid: unique '<bias>:<stage>' ids, personas, prompts, flags", () => {
    expect(validateMatrix(MATRIX)).toEqual([]);
  });

  test("every cell carries a substantive intervention prompt and non-empty flag", () => {
    for (const cell of MATRIX) {
      expect(cell.prompt.trim().length).toBeGreaterThan(100); // real prompts, not stubs
      expect(cell.flag.trim().length).toBeGreaterThan(0);
      expect(cell.personas.length).toBeGreaterThan(0);
    }
  });

  test("both trigger kinds are represented in the registry (ISC-8)", () => {
    const kinds = new Set(MATRIX.map((c) => c.trigger.kind));
    expect(kinds.has("stage-entry")).toBe(true);
    expect(kinds.has("signal")).toBe(true);
  });

  test("every declared signal is used by at least one cell", () => {
    const signals = new Set(
      MATRIX.flatMap((c) => (c.trigger.kind === "signal" ? [c.trigger.signal] : [])),
    );
    expect(signals).toEqual(new Set(SIGNAL_IDS));
  });

  test("the four case-referenced cell ids exist", () => {
    for (const id of CASE_REFERENCED_CELL_IDS) {
      const cell = getCell(id);
      expect(cell).toBeDefined();
      expect(cell?.id).toBe(id);
    }
  });

  test("comparative-case cell challenges 'comparing because they differ'", () => {
    const cell = getCell("confirmation:site-sample");
    expect(cell?.prompt.toLowerCase()).toContain("different");
    expect(cell?.prompt.toLowerCase()).toContain("compar");
  });

  test("sycophancy pilot-data cell demands refutation attempts", () => {
    const cell = getCell("sycophancy:pilot-data");
    expect(cell?.trigger).toEqual({ kind: "signal", signal: "acceptance-streak" });
    expect(cell?.prompt.toLowerCase()).toContain("refutation");
  });
});
