import CryptoKit
import XCTest
@testable import BridgeCore

/// M57, ISC-559. The app serves the Abductive site on the bridge's own origin,
/// from a mirror of the hosted site when it has one and the build bundled in
/// the app when it does not. Hash routes serve the index; bridge paths stay the
/// bridge's; the dev-server paths under /cli-bridge map onto the bridge's own.
final class SiteTests: XCTestCase {
    var tmp: URL!

    override func setUpWithError() throws {
        tmp = FileManager.default.temporaryDirectory.appendingPathComponent("site-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: tmp, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws { try? FileManager.default.removeItem(at: tmp) }

    func write(_ root: URL, _ path: String, _ text: String) throws {
        let url = root.appendingPathComponent(path)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(text.utf8).write(to: url)
    }

    func sha(_ s: String) -> String { SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined() }

    func manifest(_ files: [String: String]) -> String {
        let entries = files.keys.sorted().map { #"{"path":"\#($0)","sha256":"\#(sha(files[$0]!))","bytes":\#(files[$0]!.utf8.count)}"# }
        return #"{"files":[\#(entries.joined(separator: ","))]}"#
    }

    /// A bundle directory holding a small site and its manifest.
    func bundle(_ files: [String: String]) throws -> URL {
        let root = tmp.appendingPathComponent("bundle")
        for (p, t) in files { try write(root, p, t) }
        try write(root, siteManifestName, manifest(files))
        return root
    }

    let site = [
        "index.html": "<!doctype html><title>Abductive</title>",
        "assets/index-abc.js": "console.log(1)",
        "assets/index-abc.css": "body{}",
        "intro/hero.jpg": "JPEGDATA",
    ]

    func handler(_ files: SiteFiles?) -> BridgeHandler {
        BridgeHandler(probes: FakeProbes(version: "2.1.283 (Claude Code)", signed: true), runner: FakeRunner(),
                      appVersion: "app 1.1.0", site: files)
    }

    func req(_ method: String, _ path: String, _ headers: [String: String] = [:]) -> BridgeRequest {
        BridgeRequest(method: method, uri: path, headers: headers, body: Data())
    }

    func text(_ r: BridgeResponse) -> String {
        if case .bytes(let d) = r.body { return String(decoding: d, as: UTF8.self) }
        return "<stream>"
    }

    // MARK: serving

    func testRootAndHashRoutesServeTheIndex() async throws {
        let h = handler(SiteFiles(roots: { [try! self.bundle(self.site)] }))
        for path in ["/", "/index.html", "/study/abc", "/?x=1", "/auth"] {
            let r = await h.handle(req("GET", path))
            XCTAssertEqual(r.status, 200, path)
            XCTAssertEqual(r.header("content-type"), "text/html;charset=utf-8", path)
            XCTAssertEqual(text(r), site["index.html"], path)
            XCTAssertEqual(r.header("cache-control"), "no-cache", path)
        }
    }

    func testAssetsServeWithTheirTypes() async throws {
        let h = handler(SiteFiles(roots: { [try! self.bundle(self.site)] }))
        let js = await h.handle(req("GET", "/assets/index-abc.js"))
        XCTAssertEqual(js.status, 200)
        XCTAssertEqual(js.header("content-type"), "text/javascript;charset=utf-8")
        XCTAssertEqual(js.header("cache-control"), "public, max-age=31536000, immutable")
        let css = await h.handle(req("GET", "/assets/index-abc.css"))
        XCTAssertEqual(css.header("content-type"), "text/css;charset=utf-8")
        let jpg = await h.handle(req("GET", "/intro/hero.jpg"))
        XCTAssertEqual(jpg.header("content-type"), "image/jpeg")
        XCTAssertEqual(text(jpg), "JPEGDATA")
    }

    func testHeadAnswersWithoutABody() async throws {
        let h = handler(SiteFiles(roots: { [try! self.bundle(self.site)] }))
        let r = await h.handle(req("HEAD", "/intro/hero.jpg"))
        XCTAssertEqual(r.status, 200)
        XCTAssertEqual(r.header("content-length"), "8")
        XCTAssertEqual(text(r), "")
    }

    func testAMissingAssetIs404NotTheIndex() async throws {
        let h = handler(SiteFiles(roots: { [try! self.bundle(self.site)] }))
        for path in ["/assets/gone.js", "/AbductiveBridge.dmg", "/nothing.png"] {
            let r = await h.handle(req("GET", path))
            XCTAssertEqual(r.status, 404, path)
        }
    }

    func testNoPathLeavesTheSite() async throws {
        let root = try bundle(site)
        try write(tmp, "secret.txt", "secret")
        let h = handler(SiteFiles(roots: { [root] }))
        for path in ["/../secret.txt", "/assets/../../secret.txt", "/%2e%2e/secret.txt", "/assets/%2e%2e/%2e%2e/secret.txt"] {
            let r = await h.handle(req("GET", path))
            XCTAssertNotEqual(text(r), "secret", path)
            XCTAssertEqual(r.status, 404, path)
        }
    }

    func testBridgeRoutesStayTheBridgesAndCliBridgeMapsOntoThem() async throws {
        let h = handler(SiteFiles(roots: { [try! self.bundle(self.site)] }))
        let health = await h.handle(req("GET", "/health"))
        XCTAssertEqual(text(health), #"{"ok":true,"claude":"2.1.283 (Claude Code)","signedIn":true,"bun":"app 1.1.0","providers":{"claude":{"version":"2.1.283 (Claude Code)","signedIn":true},"codex":{"version":null,"signedIn":null},"local":{"reachable":false,"endpoint":null,"models":[],"needsKey":false}}}"#)
        let mapped = await h.handle(req("GET", "/cli-bridge/health", ["origin": "http://localhost:8787"]))
        XCTAssertEqual(text(mapped), text(health))
        XCTAssertEqual(mapped.header("access-control-allow-origin"), "http://localhost:8787")
        let complete = await h.handle(req("POST", "/cli-bridge/complete"))
        XCTAssertEqual(complete.status, 500, "an empty body is the bridge's own 500, so the path reached /complete")
        for (m, p) in [("GET", "/complete"), ("GET", "/stream"), ("POST", "/"), ("POST", "/nothing"), ("PUT", "/")] {
            let r = await h.handle(req(m, p))
            XCTAssertEqual(r.status, 404, "\(m) \(p)")
            XCTAssertEqual(text(r), "cli-bridge: POST /complete, POST /stream, or GET /health", "\(m) \(p)")
        }
    }

    func testAStrangerIsRefusedForTheSiteToo() async throws {
        let h = handler(SiteFiles(roots: { [try! self.bundle(self.site)] }))
        let r = await h.handle(req("GET", "/", ["origin": "https://example.com"]))
        XCTAssertEqual(r.status, 403)
    }

    func testWithoutASiteTheRootIsTheUsage404() async {
        let r = await handler(nil).handle(req("GET", "/"))
        XCTAssertEqual(r.status, 404)
        XCTAssertEqual(text(r), "cli-bridge: POST /complete, POST /stream, or GET /health")
    }

    func testTheFirstRootWithAFileWins() async throws {
        let first = tmp.appendingPathComponent("mirror")
        try write(first, "index.html", "mirror index")
        let h = handler(SiteFiles(roots: { [first, try! self.bundle(self.site)] }))
        let index = await h.handle(req("GET", "/"))
        XCTAssertEqual(text(index), "mirror index")
        let fallback = await h.handle(req("GET", "/intro/hero.jpg"))
        XCTAssertEqual(text(fallback), "JPEGDATA")
    }

    func testContentTypes() {
        XCTAssertEqual(contentType(forPath: "a.mjs"), "text/javascript;charset=utf-8")
        XCTAssertEqual(contentType(forPath: "a.json"), "application/json;charset=utf-8")
        XCTAssertEqual(contentType(forPath: "a.svg"), "image/svg+xml")
        XCTAssertEqual(contentType(forPath: "a.woff2"), "font/woff2")
        XCTAssertEqual(contentType(forPath: "bridge.ts"), "text/plain;charset=utf-8")
        XCTAssertEqual(contentType(forPath: "a.unknown"), "application/octet-stream")
    }

    // MARK: the bundle

    func testVerifyBundleAcceptsAMatchingBuildAndNamesEveryDifference() throws {
        let root = try bundle(site)
        XCTAssertEqual(try verifySiteBundle(at: root), [])
        try write(root, "assets/index-abc.js", "changed")
        try write(root, "extra.txt", "x")
        try FileManager.default.removeItem(at: root.appendingPathComponent("intro/hero.jpg"))
        XCTAssertEqual(try verifySiteBundle(at: root).sorted(),
                       ["changed: assets/index-abc.js", "extra: extra.txt", "missing: intro/hero.jpg"])
    }

    // MARK: the mirror

    /// A fake hosted site: path to (status, content type, body).
    final class Remote: @unchecked Sendable {
        var files: [String: (Int, String, Data)] = [:]
        var asked: [String] = []
        func fetch(_ url: URL) async throws -> SiteFetchResult {
            let path = String(url.path.dropFirst())
            asked.append(path)
            // Pages answers a path it has no file for with index.html and a 200.
            guard let f = files[path] else { return SiteFetchResult(status: 200, contentType: "text/html; charset=utf-8", body: Data("<html>".utf8)) }
            return SiteFetchResult(status: f.0, contentType: f.1, body: f.2)
        }
    }

    func remote(_ files: [String: String], manifestFor: [String: String]? = nil) -> Remote {
        let r = Remote()
        for (p, t) in files { r.files[p] = (200, contentType(forPath: p), Data(t.utf8)) }
        r.files[siteManifestName] = (200, "application/json", Data(manifest(manifestFor ?? files).utf8))
        return r
    }

    func mirror(_ r: Remote) -> SiteMirror {
        SiteMirror(remote: URL(string: "https://abductive.pages.dev")!, cache: tmp.appendingPathComponent("cache"),
                   fetch: { try await r.fetch($0) })
    }

    func testRefreshBuildsAMirrorThatServes() async throws {
        let r = remote(site)
        let m = mirror(r)
        let none = m.currentRoot()
        XCTAssertNil(none)
        let ok = await m.refresh()
        XCTAssertTrue(ok)
        let root = try XCTUnwrap(m.currentRoot())
        XCTAssertEqual(try verifySiteBundle(at: root), [])
        let h = handler(SiteFiles(roots: { [root] }))
        let index = await h.handle(req("GET", "/study/1"))
        XCTAssertEqual(text(index), site["index.html"])
    }

    func testASecondRefreshFetchesOnlyWhatChanged() async throws {
        let r = remote(site)
        let m = mirror(r)
        _ = await m.refresh()
        var next = site
        next["index.html"] = "<!doctype html><title>Abductive 2</title>"
        let r2 = remote(next)
        r.files = r2.files
        r.asked = []
        let ok = await m.refresh()
        XCTAssertTrue(ok)
        XCTAssertEqual(r.asked.sorted(), [siteManifestName, "index.html"].sorted())
        let root = try XCTUnwrap(m.currentRoot())
        XCTAssertEqual(try String(contentsOf: root.appendingPathComponent("index.html"), encoding: .utf8), next["index.html"])
    }

    func testAHostWithoutAManifestLeavesNoMirror() async throws {
        let r = Remote() // every path answers index.html, as Pages does
        let m = mirror(r)
        let ok = await m.refresh()
        XCTAssertFalse(ok)
        let root = m.currentRoot()
        XCTAssertNil(root)
    }

    func testAFileThatDoesNotMatchItsHashKeepsThePreviousMirror() async throws {
        let r = remote(site)
        let m = mirror(r)
        _ = await m.refresh()
        var next = site
        next["assets/index-abc.js"] = "console.log(2)"
        let r2 = remote(site, manifestFor: next) // the manifest promises a file the host does not serve
        r.files = r2.files
        let ok = await m.refresh()
        XCTAssertFalse(ok)
        let root = try XCTUnwrap(m.currentRoot())
        XCTAssertEqual(try String(contentsOf: root.appendingPathComponent("assets/index-abc.js"), encoding: .utf8), "console.log(1)")
    }

    func testAManifestNamingAPathOutsideTheSiteIsRefused() async throws {
        let r = remote(site)
        r.files[siteManifestName] = (200, "application/json", Data(#"{"files":[{"path":"../evil","sha256":"00","bytes":1},{"path":"index.html","sha256":"00","bytes":1}]}"#.utf8))
        let ok = await mirror(r).refresh()
        XCTAssertFalse(ok)
        XCTAssertFalse(FileManager.default.fileExists(atPath: tmp.appendingPathComponent("evil").path))
    }

    func testAnOfflineRefreshKeepsWhatWasThere() async throws {
        let r = remote(site)
        let m = mirror(r)
        _ = await m.refresh()
        let offline = SiteMirror(remote: URL(string: "https://abductive.pages.dev")!, cache: tmp.appendingPathComponent("cache"),
                                 fetch: { _ in throw URLError(.notConnectedToInternet) })
        let ok = await offline.refresh()
        XCTAssertFalse(ok)
        let root = offline.currentRoot()
        XCTAssertNotNil(root)
    }
}
