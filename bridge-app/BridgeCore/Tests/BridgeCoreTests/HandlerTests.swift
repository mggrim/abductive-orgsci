import XCTest
@testable import BridgeCore

final class FakeProbes: HealthProbes, @unchecked Sendable {
    var version: String?
    var signed: Bool?
    var asked = 0
    init(version: String?, signed: Bool?) { self.version = version; self.signed = signed }
    func claudeVersion() async -> String? { asked += 1; return version }
    func signedIn() async -> Bool? { asked += 1; return signed }
}

final class FakeRunner: ClaudeRunning, @unchecked Sendable {
    var ran = 0
    var result: Result<(text: String, model: String), Error> = .success((text: "hello", model: "claude-sonnet-5"))
    var lastSystem = ""
    var lastPrompt = ""
    var lastModel = ""
    func complete(system: String, prompt: String, model: String) async throws -> (text: String, model: String) {
        ran += 1; lastSystem = system; lastPrompt = prompt; lastModel = model
        return try result.get()
    }
    func stream(system: String, prompt: String, model: String) -> AsyncStream<StreamEvent> {
        ran += 1; lastModel = model
        return AsyncStream { c in
            c.yield(.delta("he")); c.yield(.delta("llo")); c.yield(.final(text: "hello", model: "claude-sonnet-5"))
            c.finish()
        }
    }
}

struct Boom: Error, CustomStringConvertible { var description: String { "claude CLI exited 1: nope" } }

final class HandlerTests: XCTestCase {
    let site = "https://abductive.pages.dev"

    func handler(_ p: FakeProbes = FakeProbes(version: "2.1.283 (Claude Code)", signed: true),
                 _ r: FakeRunner = FakeRunner()) -> BridgeHandler {
        BridgeHandler(probes: p, runner: r, appVersion: "app 1.0.0")
    }

    func req(_ method: String, _ path: String, _ headers: [String: String] = [:], body: String = "") -> BridgeRequest {
        BridgeRequest(method: method, uri: path, headers: headers, body: Data(body.utf8))
    }

    func bodyText(_ r: BridgeResponse) -> String {
        if case .bytes(let d) = r.body { return String(decoding: d, as: UTF8.self) }
        return "<stream>"
    }

    func testHealthShape() async {
        let r = await handler().handle(req("GET", "/health"))
        XCTAssertEqual(r.status, 200)
        XCTAssertEqual(r.header("content-type"), "application/json;charset=utf-8")
        XCTAssertEqual(bodyText(r), #"{"ok":true,"claude":"2.1.283 (Claude Code)","signedIn":true,"bun":"app 1.0.0","providers":{"claude":{"version":"2.1.283 (Claude Code)","signedIn":true},"codex":{"version":null,"signedIn":null},"local":{"reachable":false,"endpoint":null,"models":[],"needsKey":false}}}"#)
        XCTAssertNil(r.header("access-control-allow-origin"))
    }

    func testHealthWithoutClaudeDoesNotAskSignIn() async {
        let p = FakeProbes(version: nil, signed: true)
        let r = await handler(p).handle(req("GET", "/health?x=1"))
        XCTAssertEqual(bodyText(r), #"{"ok":true,"claude":null,"signedIn":null,"bun":"app 1.0.0","providers":{"claude":{"version":null,"signedIn":null},"codex":{"version":null,"signedIn":null},"local":{"reachable":false,"endpoint":null,"models":[],"needsKey":false}}}"#)
        XCTAssertEqual(p.asked, 1)
    }

    func testHealthFromSiteCarriesOrigin() async {
        let r = await handler().handle(req("GET", "/health", ["origin": site]))
        XCTAssertEqual(r.header("access-control-allow-origin"), site)
        XCTAssertEqual(r.header("vary"), "Origin")
    }

    func testPreflightPerRoute() async {
        for path in ["/health", "/complete", "/stream"] {
            let r = await handler().handle(req("OPTIONS", path, [
                "origin": site, "access-control-request-method": "POST",
                "access-control-request-private-network": "true",
            ]))
            XCTAssertEqual(r.status, 204, path)
            XCTAssertEqual(r.header("access-control-allow-origin"), site)
            XCTAssertEqual(r.header("access-control-allow-methods"), "GET, POST, OPTIONS")
            XCTAssertEqual(r.header("access-control-allow-headers"), "content-type")
            XCTAssertEqual(r.header("access-control-max-age"), "600")
            XCTAssertEqual(r.header("access-control-allow-private-network"), "true")
            XCTAssertEqual(r.header("access-control-allow-local-network"), "true")
            XCTAssertEqual(r.header("vary"), "Origin")
        }
        let plain = await handler().handle(req("OPTIONS", "/health", ["origin": site]))
        XCTAssertNil(plain.header("access-control-allow-private-network"))
        let local = await handler().handle(req("OPTIONS", "/health", ["origin": site, "access-control-request-local-network": "true"]))
        XCTAssertEqual(local.header("access-control-allow-local-network"), "true")
        let other = await handler().handle(req("OPTIONS", "/elsewhere", ["origin": site]))
        XCTAssertEqual(other.status, 404)
        XCTAssertEqual(bodyText(other), "")
    }

    func testStrangerRefusedBeforeAnyWork() async {
        let p = FakeProbes(version: "x", signed: true)
        let run = FakeRunner()
        let h = handler(p, run)
        for (m, path) in [("OPTIONS", "/health"), ("GET", "/health"), ("POST", "/complete"), ("POST", "/stream")] {
            let r = await h.handle(req(m, path, ["origin": "https://example.com", "content-type": "text/plain"], body: "{}"))
            XCTAssertEqual(r.status, 403)
            XCTAssertEqual(bodyText(r), "cli-bridge: this origin may not use the bridge")
            XCTAssertEqual(r.header("content-type"), "text/plain;charset=utf-8")
            XCTAssertNil(r.header("access-control-allow-origin"))
        }
        XCTAssertEqual(p.asked, 0)
        XCTAssertEqual(run.ran, 0)
    }

    func testCompleteShapeAndDefaults() async {
        let run = FakeRunner()
        let r = await handler(FakeProbes(version: "x", signed: true), run)
            .handle(req("POST", "/complete", ["origin": site], body: #"{"messages":[{"role":"user","content":"hi"}]}"#))
        XCTAssertEqual(r.status, 200)
        XCTAssertEqual(bodyText(r), #"{"text":"hello","model":"claude-sonnet-5","modelVersion":"claude-sonnet-5"}"#)
        XCTAssertEqual(run.lastModel, "sonnet")
        XCTAssertEqual(run.lastSystem, "")
        XCTAssertEqual(run.lastPrompt, "hi\n\n\nOutput ONLY the response content — no preamble.")
        XCTAssertEqual(r.header("access-control-allow-origin"), site)
    }

    func testCompleteFailuresAre500WithError() async {
        let run = FakeRunner()
        run.result = .failure(Boom())
        let r = await handler(FakeProbes(version: "x", signed: true), run).handle(req("POST", "/complete", body: "{}"))
        XCTAssertEqual(r.status, 500)
        XCTAssertEqual(bodyText(r), #"{"error":"claude CLI exited 1: nope"}"#)
        let bad = await handler().handle(req("POST", "/complete", body: "{nope"))
        XCTAssertEqual(bad.status, 500)
        XCTAssertTrue(bodyText(bad).hasPrefix(#"{"error":""#))
        let badStream = await handler().handle(req("POST", "/stream", body: "{nope"))
        XCTAssertEqual(badStream.status, 500)
    }

    func testStreamIsSSE() async {
        let r = await handler().handle(req("POST", "/stream", ["origin": site], body: #"{"model":"haiku"}"#))
        XCTAssertEqual(r.status, 200)
        XCTAssertEqual(r.header("content-type"), "text/event-stream")
        XCTAssertEqual(r.header("cache-control"), "no-cache")
        XCTAssertEqual(r.header("connection"), "keep-alive")
        XCTAssertEqual(r.header("access-control-allow-origin"), site)
        guard case .stream(let chunks) = r.body else { return XCTFail("not a stream") }
        var all = ""
        for await c in chunks { all += String(decoding: c, as: UTF8.self) }
        XCTAssertEqual(all, ": open\n\n" +
            "event: delta\ndata: {\"text\":\"he\"}\n\n" +
            "event: delta\ndata: {\"text\":\"llo\"}\n\n" +
            "event: final\ndata: {\"text\":\"hello\",\"model\":\"claude-sonnet-5\"}\n\n")
    }

    func testEverythingElseIs404WithTheUsageLine() async {
        for (m, path) in [("GET", "/complete"), ("GET", "/"), ("POST", "/nothing")] {
            let r = await handler().handle(req(m, path, ["origin": site]))
            XCTAssertEqual(r.status, 404)
            XCTAssertEqual(bodyText(r), "cli-bridge: POST /complete, POST /stream, or GET /health")
            XCTAssertEqual(r.header("access-control-allow-origin"), site)
        }
        // /health answers any method, as the TS bridge does.
        let post = await handler().handle(req("POST", "/health"))
        XCTAssertEqual(post.status, 200)
    }
}

final class MenuTests: XCTestCase {
    /// M56, ISC-574: the status line names the lane the page last used; before
    /// any turn the app has nothing to report and says only where it runs.
    func testStatusLineNamesTheLaneInUse() {
        XCTAssertEqual(MenuCopy.status(.running, port: 8787, lane: "claude"), "Running on this Mac, port 8787, Claude Code")
        XCTAssertEqual(MenuCopy.status(.running, port: 8787, lane: "codex"), "Running on this Mac, port 8787, Codex")
        XCTAssertEqual(MenuCopy.status(.running, port: 8787, lane: nil), "Running on this Mac, port 8787")
        XCTAssertEqual(MenuCopy.status(.portTaken, port: 8787, lane: "codex"), "Port 8787 is taken by another program")
        XCTAssertEqual(MenuCopy.status(.starting, port: 8787, lane: nil), "Starting the bridge on port 8787…")
    }

    func testTwoQuietLanesLines() {
        XCTAssertEqual(MenuCopy.laneLine("claude", .signedIn), "Claude Code: signed in")
        XCTAssertEqual(MenuCopy.laneLine("claude", .signedOut), "Claude Code: not signed in")
        XCTAssertEqual(MenuCopy.laneLine("codex", .notInstalled), "Codex: not installed")
        XCTAssertEqual(MenuCopy.laneLine("codex", .unknown), "Codex: installed")
    }

    func testLaneStateFromProbes() {
        XCTAssertEqual(LaneState.from(version: nil, signedIn: nil), .notInstalled)
        XCTAssertEqual(LaneState.from(version: "2", signedIn: false), .signedOut)
        XCTAssertEqual(LaneState.from(version: "2", signedIn: true), .signedIn)
        XCTAssertEqual(LaneState.from(version: "2", signedIn: nil), .unknown)
        XCTAssertEqual(BridgeStatus.from(listening: false), .portTaken)
        XCTAssertEqual(BridgeStatus.from(listening: true), .running)
    }

    func testItemsOnlyWhenTheyApply() {
        XCTAssertEqual(MenuCopy.items(.running, claude: .signedIn, codex: .signedIn), [.openAbductive, .startAtLogin, .quit])
        XCTAssertEqual(MenuCopy.items(.running, claude: .notInstalled, codex: .signedOut),
                       [.openAbductive, .installClaude, .signInCodex, .startAtLogin, .quit])
        XCTAssertEqual(MenuCopy.items(.running, claude: .signedOut, codex: .notInstalled),
                       [.openAbductive, .signIn, .installCodex, .startAtLogin, .quit])
        // With the port taken nothing was asked, so no lane item is offered.
        XCTAssertEqual(MenuCopy.items(.portTaken, claude: .notInstalled, codex: .notInstalled), [.openAbductive, .startAtLogin, .quit])
        XCTAssertEqual(MenuCopy.label(.installCodex), "Install Codex…")
        XCTAssertEqual(MenuCopy.label(.signInCodex), "Sign in to Codex…")
        XCTAssertEqual(MenuCopy.label(.installClaude), "Install Claude Code…")
        XCTAssertEqual(MenuCopy.label(.signIn), "Sign in to Claude Code…")
    }

    /// The lane in use is the page's choice: the app learns it from the requests.
    func testTheHandlerReportsTheLaneEachTurnNames() async {
        final class Seen: @unchecked Sendable { var lanes: [String] = [] }
        let seen = Seen()
        let h = BridgeHandler(probes: FakeProbes(version: "c", signed: true), runner: FakeRunner(),
                              codexProbes: FakeProbes(version: "v", signed: true), codexRunner: FakeRunner(),
                              appVersion: "app 1.2.0", onLane: { seen.lanes.append($0) })
        func post(_ path: String, _ body: String) async {
            _ = await h.handle(BridgeRequest(method: "POST", uri: path, headers: [:], body: Data(body.utf8)))
        }
        await post("/complete", #"{"provider":"codex"}"#)
        await post("/stream", #"{"messages":[]}"#)
        await post("/complete", #"{"provider":"gemini"}"#)
        XCTAssertEqual(seen.lanes, ["codex", "claude"])
    }

    func testLinks() {
        // M57, ISC-560: Open Abductive opens the site the app serves, on the bridge's origin.
        XCTAssertEqual(MenuCopy.abductiveURL(port: 8787).absoluteString, "http://localhost:8787/")
        XCTAssertEqual(MenuCopy.abductiveURL(port: 8797).absoluteString, "http://localhost:8797/")
        XCTAssertEqual(MenuCopy.installURL.absoluteString, "https://code.claude.com/docs/en/setup")
        XCTAssertEqual(MenuCopy.codexInstallURL.absoluteString, "https://developers.openai.com/codex")
    }
}

final class LocatorTests: XCTestCase {
    func testSearchOrder() {
        let home = "/Users/r"
        let dirs = claudeSearchDirectories(path: "/usr/bin:/bin:/opt/x", home: home)
        XCTAssertEqual(Array(dirs.prefix(3)), ["/usr/bin", "/bin", "/opt/x"])
        for d in ["/Users/r/.local/bin", "/usr/local/bin", "/opt/homebrew/bin", "/Users/r/.claude/local/bin",
                  "/Users/r/.claude/local", "/Users/r/.npm-global/bin"] {
            XCTAssertTrue(dirs.contains(d), d)
        }
    }

    func testFindsTheFirstExecutable() {
        let found = locateClaude(path: "/a:/b", home: "/h", isExecutable: { $0 == "/h/.local/bin/claude" }, loginShell: { nil })
        XCTAssertEqual(found, "/h/.local/bin/claude")
        let fromShell = locateClaude(path: "/a", home: "/h", isExecutable: { $0 == "/weird/claude" }, loginShell: { "/weird/claude" })
        XCTAssertEqual(fromShell, "/weird/claude")
        XCTAssertNil(locateClaude(path: "/a", home: "/h", isExecutable: { _ in false }, loginShell: { "/weird/claude" }))
    }

    func testCleanedEnvironment() {
        let env = cleanedEnvironment(["CLAUDECODE": "1", "CLAUDE_CODE_ENTRYPOINT": "x", "HOME": "/h", "PATH": "/usr/bin"],
                                     claudePath: "/h/.local/bin/claude")
        XCTAssertNil(env["CLAUDECODE"])
        XCTAssertNil(env["CLAUDE_CODE_ENTRYPOINT"])
        XCTAssertEqual(env["HOME"], "/h")
        XCTAssertTrue(env["PATH"]!.hasPrefix("/h/.local/bin:"))
        XCTAssertTrue(env["PATH"]!.contains("/usr/bin"))
    }
}
