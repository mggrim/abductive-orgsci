import XCTest
@testable import BridgeCore

/// The spawn layer's one seam: everything that knows it is talking to Claude
/// Code lives in `ClaudeProvider`; a second CLI is a second conformance.
final class ProviderTests: XCTestCase {
    let claude: CLIProvider = ClaudeProvider()

    func testIdentityAndLookup() {
        XCTAssertEqual(claude.name, "claude")
        XCTAssertEqual(claude.binaryName, "claude")
        XCTAssertTrue(claude.extraSearchDirectories(home: "/h").contains("/h/.claude/local/bin"))
        XCTAssertEqual(claude.versionArguments, ["--version"])
    }

    func testSignInProbe() {
        XCTAssertEqual(claude.signInStatusArguments, ["auth", "status"])
        XCTAssertEqual(claude.signedIn(fromStatus: #"{"loggedIn": true, "x": 1}"#), true)
        XCTAssertEqual(claude.signedIn(fromStatus: #"{"loggedIn": false}"#), false)
        XCTAssertNil(claude.signedIn(fromStatus: "Unknown command: auth"))
        XCTAssertEqual(claude.signInFallbackArguments, ["-p", "Reply with OK.", "--model", "haiku"] + isolationFlags)
    }

    func testArgvAndReducers() throws {
        let complete = try claude.prepareRun(system: "S", model: "sonnet", streaming: false)
        XCTAssertEqual(complete.arguments, completeArguments(system: "S", model: "sonnet"))
        XCTAssertEqual(complete.directory, FileManager.default.temporaryDirectory)
        XCTAssertEqual(try claude.prepareRun(system: "S", model: "sonnet", streaming: true).arguments,
                       streamArguments(system: "S", model: "sonnet"))
        let reducer = claude.makeStreamReducer(model: "sonnet")
        XCTAssertEqual(reducer.line(#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"text":"a"}}}"#), [.delta("a")])
        let done = try claude.reduceComplete(output: #"{"result":"hi","modelUsage":{"claude-sonnet-5":{"outputTokens":1}}}"#, requested: "sonnet")
        XCTAssertEqual(done.text, "hi")
        XCTAssertEqual(done.model, "claude-sonnet-5")
        XCTAssertEqual(try claude.reduceComplete(output: "plain", requested: "sonnet").text, "plain")
        XCTAssertEqual(claude.failure(output: "x", stderr: "boom"), "boom")
    }

    func testMachineRunsTheProvider() {
        // The machine side is built from a provider, not from Claude by name.
        let locator = BinaryLocator(provider: claude)
        _ = MachineProbes(provider: claude, locator: locator)
        _ = MachineRunner(provider: claude, locator: locator)
    }
}
