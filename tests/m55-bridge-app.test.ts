/**
 * M55, ISC-551. Abductive Bridge is a menu-bar app for the Mac: SwiftUI's
 * MenuBarExtra, no Dock icon, macOS 14, one status line and the items that
 * apply. The app's own strings go through one helper, `T("…")`, so the copy
 * bar reads them like any other rendered string.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Glob } from "bun";
import { FILES, proseRuns } from "./copyBarScan.ts";

const ROOT = new URL("../", import.meta.url).pathname;
const APP = `${ROOT}bridge-app/`;

function swiftSources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  for (const rel of new Glob("**/*.swift").scanSync(APP)) {
    if (/(^|\/)(\.build|build|DerivedData)\//.test(rel)) continue;
    out.push({ path: rel, text: readFileSync(APP + rel, "utf8") });
  }
  return out;
}

describe("ISC-551: the app's shape", () => {
  const yml = readFileSync(`${APP}project.yml`, "utf8");
  const plist = readFileSync(`${APP}AbductiveBridge/Info.plist`, "utf8");

  test("XcodeGen project: bundle id, name, macOS 14, Swift", () => {
    expect(yml).toContain("bundleIdPrefix: com.matthewgrimes");
    expect(yml).toContain("PRODUCT_BUNDLE_IDENTIFIER: com.matthewgrimes.AbductiveBridge");
    expect(yml).toContain('PRODUCT_NAME: "Abductive Bridge"');
    expect(yml).toMatch(/macOS: "14\.0"/);
  });

  test("no Dock icon: LSUIElement is true", () => {
    expect(plist).toMatch(/<key>LSUIElement<\/key>\s*<true\/>/);
  });

  test("the menu is a SwiftUI MenuBarExtra", () => {
    const app = swiftSources().find((f) => f.path.endsWith("AbductiveBridgeApp.swift"));
    expect(app?.text).toContain("MenuBarExtra");
  });

  test("the menu offers each item, and each only when it applies", () => {
    const copy = readFileSync(`${APP}BridgeCore/Sources/BridgeCore/MenuCopy.swift`, "utf8");
    // M56, ISC-574: the lane in use on the status line, a quiet line per lane,
    // and each lane's install and sign-in items.
    for (const s of [
      'T("Running on this Mac, port \\(port)")',
      'T("Running on this Mac, port \\(port), \\(laneName(lane))")',
      'T("\\(name): signed in")',
      'T("\\(name): not signed in")',
      'T("\\(name): not installed")',
      'T("Port \\(port) is taken by another program")',
      'T("Open Abductive")',
      'T("Install Claude Code…")',
      'T("Sign in to Claude Code…")',
      'T("Install Codex…")',
      'T("Sign in to Codex…")',
      'T("Start at login")',
      'T("Quit")',
    ]) {
      expect({ s, present: copy.includes(s) }).toEqual({ s, present: true });
    }
  });
});

describe("ISC-551: every string the app shows is on the copy bar", () => {
  test("the copy scan reads the app's Swift files", () => {
    const scanned = FILES.filter((f) => f.path.startsWith("bridge-app/"));
    expect(scanned.map((f) => f.path)).toContain("bridge-app/BridgeCore/Sources/BridgeCore/MenuCopy.swift");
    const runs = scanned.flatMap((f) => proseRuns(f.text));
    expect(runs).toContain("Sign in to Codex…");
    expect(runs).toContain("Port is taken by another program");
  });

  test("no SwiftUI control takes a bare literal: every shown string goes through T()", () => {
    const bare = /\b(?:Text|Button|Toggle|Label|Link|Section|Menu)\(\s*"/;
    const offenders = swiftSources()
      .filter((f) => bare.test(f.text))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});

describe("ISC-552: the app logs nothing and listens on loopback only", () => {
  test("no print, NSLog, os_log or Logger anywhere in the app", () => {
    const offenders = swiftSources()
      .filter((f) => /\b(?:print|debugPrint|NSLog|os_log)\(|\bLogger\(/.test(f.text))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  test("the listen addresses are 127.0.0.1 and ::1, never the wildcard", () => {
    const all = swiftSources().map((f) => f.text).join("\n");
    expect(all).toContain('["127.0.0.1", "::1"]');
    expect(all).not.toContain('"0.0.0.0"');
    expect(all).not.toContain('"::"');
  });
});

describe("ISC-552: the conformance script sends the M54 request set", () => {
  test("every CORS case the M54 tests hold the TS bridge to is on the wire list, with the same answer", async () => {
    const { CORS_CASES } = await import("../bridge-app/conformance.ts");
    const { corsDecision } = await import("../scripts/cli-bridge.ts");
    const reach = readFileSync(`${ROOT}tests/m54-bridge-reach.test.ts`, "utf8");
    const m54 = [...reach.matchAll(/\["([^"]+)", "(allow|refuse)"\]/g)].map((m) => [m[1], m[2]]);
    expect(m54.length).toBeGreaterThan(15);
    const wire = new Map<string, string>(CORS_CASES);
    for (const [origin, want] of m54) {
      expect({ origin, onWire: wire.get(origin!) }).toEqual({ origin, onWire: want });
    }
    // And the TS bridge agrees with every case the script adds.
    for (const [origin, want] of CORS_CASES) expect({ origin, d: corsDecision(origin) }).toEqual({ origin, d: want });
  });
});

describe("ISC-554: one script builds, signs, packages and notarises", () => {
  const sh = () => readFileSync(`${APP}build.sh`, "utf8");

  test("unit tests, then xcodegen and a Release build for both architectures", () => {
    const s = sh();
    expect(s).toContain("swift test --package-path BridgeCore");
    expect(s).toContain("xcodegen generate");
    expect(s).toMatch(/xcodebuild[^\n]*-configuration Release/);
    expect(s).toContain('ARCHS="arm64 x86_64"');
    expect(s.indexOf("swift test")).toBeLessThan(s.indexOf("xcodebuild"));
  });

  test("the identity: SIGN_IDENTITY, else a Developer ID Application one, else Apple Development", () => {
    const s = sh();
    expect(s).toContain('SIGN_IDENTITY="${SIGN_IDENTITY:-}"');
    const devId = s.indexOf("\\(Developer ID Application");
    const dev = s.indexOf("\\(Apple Development");
    expect(devId).toBeGreaterThan(0);
    expect(dev).toBeGreaterThan(devId);
  });

  test("hardened runtime with the app's entitlements, and a verify", () => {
    const s = sh();
    expect(s).toMatch(/codesign[^\n]*--options runtime[^\n]*--entitlements/);
    expect(s).toContain("codesign --verify --strict");
  });

  test("a DMG with an Applications link, held under 20 MB", () => {
    const s = sh();
    expect(s).toContain("ln -s /Applications");
    expect(s).toMatch(/hdiutil create[^\n]*-format UDZO/);
    expect(s).toContain("MAX_DMG_BYTES=$((20 * 1024 * 1024))");
  });

  test("notarises and staples only with a Developer ID identity and NOTARY_PROFILE", () => {
    const s = sh();
    expect(s).toContain('NOTARY_PROFILE="${NOTARY_PROFILE:-}"');
    expect(s).toMatch(/xcrun notarytool submit[^\n]*--keychain-profile "\$NOTARY_PROFILE"[^\n]*--wait/);
    expect(s).toContain("xcrun stapler staple");
  });

  test("with the Development identity alone it ends by naming the owner's two steps, and succeeds", () => {
    const s = sh();
    expect(s).toContain("Developer ID Application certificate");
    expect(s).toContain(
      "xcrun notarytool store-credentials <profile> --apple-id <id> --team-id $TEAM_ID --password <app-specific password>",
    );
    // The team is read from the signing certificate's OU, never typed in.
    expect(s).toMatch(/TEAM_ID="\$\(security find-certificate -c "\$SIGN_IDENTITY"/);
    expect(s).not.toContain("HKKUSUTBKN");
    expect(s.trimEnd().endsWith("exit 0")).toBe(true);
  });
});

/* The public research copy (abductive-orgsci) documents the local route only: the hosted
 * site is off, so the README no longer carries the hosted-route or Mac-app sections this
 * block checked. */
