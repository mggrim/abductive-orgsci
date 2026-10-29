/**
 * M57, ISC-559. The app serves the Abductive site from a mirror of the hosted
 * site or, offline, from the build bundled in the app. Both read one list the
 * build writes, `site-files.json`: every file with its SHA-256, the Mac app's
 * DMG left out, since the app has no use for a copy of itself.
 */

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SITE_MANIFEST, siteManifest, verifySite } from "../scripts/site-manifest.ts";

const ROOT = new URL("../", import.meta.url).pathname;

function tree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "m57-site-"));
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(join(dir, p, ".."), { recursive: true });
    writeFileSync(join(dir, p), text);
  }
  return dir;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("ISC-559: the build's file list", () => {
  test("lists every file with its hash and size, sorted, without the DMG or itself", () => {
    const dir = tree({
      "index.html": "<html>",
      "assets/index-a.js": "js",
      "intro/hero.jpg": "jpg",
      "AbductiveBridge.dmg": "dmg",
      [SITE_MANIFEST]: "old",
    });
    expect(siteManifest(dir)).toEqual({
      files: [
        { path: "assets/index-a.js", sha256: sha("js"), bytes: 2 },
        { path: "index.html", sha256: sha("<html>"), bytes: 6 },
        { path: "intro/hero.jpg", sha256: sha("jpg"), bytes: 3 },
      ],
    });
  });

  test("the file is site-files.json, the name the app reads", () => {
    expect(SITE_MANIFEST).toBe("site-files.json");
    const swift = readFileSync(`${ROOT}bridge-app/BridgeCore/Sources/BridgeCore/Site.swift`, "utf8");
    expect(swift).toContain('public let siteManifestName = "site-files.json"');
  });

  test("bun run build writes the list last, after Vite has written dist", () => {
    const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, "utf8")) as { scripts: { build: string } };
    expect(pkg.scripts.build.endsWith("vite build && bun scripts/site-manifest.ts dist")).toBe(true);
  });
});

describe("ISC-559: the bundled build matches the repo's build", () => {
  const build = readFileSync(`${ROOT}bridge-app/build.sh`, "utf8");

  test("build.sh builds the site, copies dist into the app without the DMG, and checks it against the list", () => {
    const bundle = build.indexOf('step "Bundle the site"');
    const sign = build.indexOf('step "Sign with hardened runtime"');
    expect(bundle).toBeGreaterThan(0);
    expect(bundle).toBeLessThan(sign); // inside the signature's seal
    const part = build.slice(bundle, sign);
    expect(part).toContain("bun run build");
    expect(part).toContain('--exclude AbductiveBridge.dmg');
    expect(part).toContain('"$APP/Contents/Resources/site"');
    expect(part).toContain('site-manifest.ts" --verify "$APP/Contents/Resources/site"');
  });

  test("verify names every file that differs from the list, and passes a match", () => {
    const dir = tree({ "index.html": "<html>", "assets/a.js": "js", "intro/x.jpg": "jpg" });
    writeFileSync(join(dir, SITE_MANIFEST), JSON.stringify(siteManifest(dir)));
    expect(verifySite(dir)).toEqual([]);
    writeFileSync(join(dir, "assets/a.js"), "changed");
    writeFileSync(join(dir, "extra.txt"), "x");
    rmSync(join(dir, "intro/x.jpg"));
    expect(verifySite(dir)).toEqual(["changed: assets/a.js", "extra: extra.txt", "missing: intro/x.jpg"]);
  });

  test("the list in dist matches the files in dist, when a build is there", () => {
    let listed: string;
    try {
      listed = readFileSync(`${ROOT}dist/${SITE_MANIFEST}`, "utf8");
    } catch {
      return; // no build in this checkout; build.sh runs the check on every release
    }
    expect(JSON.parse(listed)).toEqual(siteManifest(`${ROOT}dist`));
  });
});

describe("ISC-560: abductive-bridge://start reaches the running app", () => {
  test("the app takes the get-URL Apple Event itself, before launch finishes, and routes it to the same handler", () => {
    const app = readFileSync(`${ROOT}bridge-app/AbductiveBridge/AbductiveBridgeApp.swift`, "utf8");
    const will = app.indexOf("func applicationWillFinishLaunching");
    expect(will).toBeGreaterThan(0);
    expect(app.slice(will, will + 400)).toContain("forEventClass: AEEventClass(kInternetEventClass), andEventID: AEEventID(kAEGetURL)");
    expect(app).toMatch(/func handleGetURL[\s\S]{0,300}application\(NSApp, open: \[url\]\)/);
    expect(app).toMatch(/if reason\.opensSite \{[\s\S]{0,400}RunLoop\.main\.add\(timer, forMode: \.common\)/);
    expect(app).toContain("BridgeModel.shared.openAbductiveNow()");
  });
});
