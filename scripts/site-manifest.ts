/**
 * M57, ISC-559. Writes `site-files.json` into a built site: every file with its
 * SHA-256 and size. Abductive Bridge reads the list twice: to mirror the hosted
 * site file by file, and to check the build bundled in the app. The Mac app's
 * own DMG is left out, since the app has no use for a copy of itself.
 *
 *   bun scripts/site-manifest.ts dist                 # write the list
 *   bun scripts/site-manifest.ts --verify <dir>        # check a copy against its list
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { Glob } from "bun";

export const SITE_MANIFEST = "site-files.json";
const LEFT_OUT = new Set([SITE_MANIFEST, "AbductiveBridge.dmg"]);

export interface SiteManifest {
  files: { path: string; sha256: string; bytes: number }[];
}

export function siteManifest(dir: string): SiteManifest {
  const paths = [...new Glob("**/*").scanSync({ cwd: dir, onlyFiles: true, dot: true })]
    .filter((p) => !LEFT_OUT.has(p))
    .sort();
  return {
    files: paths.map((path) => {
      const data = readFileSync(`${dir}/${path}`);
      return { path, sha256: createHash("sha256").update(data).digest("hex"), bytes: data.length };
    }),
  };
}

/**
 * Every difference between a copy of the site and the list inside it, as
 * "changed: p", "extra: p" or "missing: p", sorted. Empty when they match.
 * build.sh runs this on the copy it bundles into the app.
 */
export function verifySite(dir: string): string[] {
  const listed = (JSON.parse(readFileSync(`${dir}/${SITE_MANIFEST}`, "utf8")) as SiteManifest).files;
  const present = new Map(siteManifest(dir).files.map((f) => [f.path, f.sha256]));
  const problems: string[] = [];
  for (const f of listed) {
    const sha = present.get(f.path);
    if (sha === undefined) problems.push(`missing: ${f.path}`);
    else if (sha !== f.sha256) problems.push(`changed: ${f.path}`);
    present.delete(f.path);
  }
  for (const p of present.keys()) problems.push(`extra: ${p}`);
  return problems.sort();
}

if (import.meta.main && process.argv[2] === "--verify") {
  const dir = process.argv[3] ?? "";
  const problems = verifySite(dir);
  for (const p of problems) console.log(p);
  console.log(problems.length === 0 ? `site: ${dir} matches ${SITE_MANIFEST}` : `site: ${problems.length} difference(s)`);
  process.exit(problems.length === 0 ? 0 : 1);
} else if (import.meta.main) {
  const dir = process.argv[2] ?? "dist";
  const manifest = siteManifest(dir);
  writeFileSync(`${dir}/${SITE_MANIFEST}`, JSON.stringify(manifest, null, 1) + "\n");
  console.log(`${SITE_MANIFEST}: ${manifest.files.length} files`);
}
