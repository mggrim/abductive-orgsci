/** Shared fixtures for persona-engine tests. Creeds are read from disk so
 * bun test never depends on Vite's `?raw` loader (creeds.ts is Vite-only). */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Chunk } from "../src/state/chunks.ts";
import { emptyBrief, type Project } from "../src/state/projects.ts";

const CREEDS_DIR = join(import.meta.dir, "..", "content", "creeds");

export const TEST_CREEDS: Record<string, string> = {
  "eisenhardt-positivist": readFileSync(
    join(CREEDS_DIR, "eisenhardt-positivist.md"),
    "utf8",
  ),
  "langley-process": readFileSync(join(CREEDS_DIR, "langley-process.md"), "utf8"),
  "tavory-timmermans-abduction": readFileSync(
    join(CREEDS_DIR, "tavory-timmermans-abduction.md"),
    "utf8",
  ),
};

export function testProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-test",
    title: "Handoffs on the night ward",
    stage: "design-brief",
    brief: {
    ...emptyBrief(),
      researchQuestion: "How do handoff routines absorb interruption?",
      siteRationale: "A single teaching-hospital ward with negotiated access",
      sampleRationale: "All nurses on two rotating shifts, theoretically sampled",
      dataType: "interview",
    },
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

export function testChunk(id: string, index = 0): Chunk {
  return {
    id,
    projectId: "proj-test",
    documentId: "doc-1",
    kind: "transcript",
    text: `Excerpt ${id}: the charge nurse re-ran the handoff after the alarm.`,
    index,
  };
}
