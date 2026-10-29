/**
 * M53, ISC-540: the theoretical motivation is a tab, first in the strip, and a new
 * study opens on it.
 *
 * The owner, seeing the M52 build: "Move Theoretical Motivation to its own tab in
 * front of Design." The page itself is exercised by design-page-m27, m37-station-chat,
 * m38-chrome, m40-puzzle-reading, m41-framing-dock and framing-band-live; this file
 * holds the claims that belong to no one surface.
 */
import { describe, expect, test } from "bun:test";
import { STUDY_TABS, STUDY_TAB_LABEL, motivationPath, parseHash } from "../src/ui/routes.ts";
import { ALWAYS_SHOWN } from "../src/views/earnedTabs.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const read = async (rel: string) => await Bun.file(SRC + rel).text();

describe("the starting point is the first tab (ISC-540)", () => {
  test("first in the strip, before Design, under its own label", () => {
    expect(STUDY_TABS[0]).toBe("motivation");
    expect(STUDY_TABS[1]).toBe("design");
    expect(STUDY_TAB_LABEL.motivation).toBe("Starting point");
  });

  test("always shown, so a study with nothing in it has it", () => {
    expect(ALWAYS_SHOWN[0]).toBe("motivation");
  });

  test("both places that create a study open it on the tab", async () => {
    for (const file of ["ui/Introduction.tsx", "ui/ProjectList.tsx"]) {
      const src = await read(file);
      expect({ file, opens: src.includes('navigate(studyPath(project.id, "motivation"))') }).toEqual({
        file,
        opens: true,
      });
      expect({ file, old: /navigate\(studyPath\(project\.id\)\)/.test(src) }).toEqual({ file, old: false });
    }
  });

  test("the route parses to the tab, with or without a field", () => {
    expect(parseHash(motivationPath("s1"))).toMatchObject({ view: "study", tab: "motivation" });
    expect(parseHash(motivationPath("s1", "framing-venue"))).toMatchObject({ view: "study", tab: "motivation" });
  });

  test("Anti: the dock is gone from the shell", async () => {
    const shell = await read("ui/AppShell.tsx");
    expect(shell).not.toContain("<FramingBand");
    const band = await read("flow/FramingBand.tsx");
    expect(band).not.toContain("<details");
    expect(band).not.toMatch(/export function FramingBand\b/);
  });
});
