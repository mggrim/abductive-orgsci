import XCTest
@testable import BridgeCore

/// M61 follow-up, ISC-591 (the app half). The Codex lane offers gpt-6.1-sol, a
/// ChatGPT sign-in refuses it, and the app's bridge passes Codex's own sentence
/// through unchanged, as scripts/cli-bridge.ts does (tests/m61-models.test.ts
/// reads the same fixture: the real output of codex-cli 0.159.2 on the owner's
/// Mac, 2026-09-30; the lead saw the same refusal from 0.146.0).
final class RefusalTests: XCTestCase {
    let codex = CodexProvider()
    let refused = "The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account."

    func fixturePath() -> String {
        URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("Fixtures").appendingPathComponent("codex-refused-gpt-6.1-sol.jsonl").path
    }

    func testTheListOffersGpt61AfterTheDefault() {
        XCTAssertEqual(codexModels, ["gpt-5.6-sol", "gpt-6.1-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5"])
        XCTAssertEqual(defaultCodexModel, "gpt-5.6-sol")
        XCTAssertEqual(codexModel(.string("gpt-6.1-sol")), "gpt-6.1-sol")
    }

    func testTheRefusalIsTheCLIsOwnSentence() throws {
        let output = try String(contentsOfFile: fixturePath(), encoding: .utf8)
        XCTAssertThrowsError(try codex.reduceComplete(output: output, requested: "gpt-6.1-sol")) { e in
            XCTAssertEqual(String(describing: e), self.refused)
        }
        XCTAssertEqual(codex.ownFailure(output: output), refused)
        XCTAssertNil(ClaudeProvider().ownFailure(output: output))
        let reducer = codex.makeStreamReducer(model: "gpt-6.1-sol")
        let events = output.split(separator: "\n").flatMap { reducer.line(String($0)) } + reducer.end()
        XCTAssertEqual(events, [.error(refused)])
        // A message that is not an API body passes as Codex wrote it.
        XCTAssertEqual(codexFailureSentence("stream disconnected"), "stream disconnected")
    }

    func testTheMachinePassesTheSentenceOnUnchanged() async throws {
        // A fake codex that replays the refusal and exits 1, first on PATH.
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("m61-refusing-codex-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let fake = dir.appendingPathComponent("codex")
        try "#!/bin/sh\ncat > /dev/null\ncat \"\(fixturePath())\"\nexit 1\n".write(to: fake, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: fake.path)
        let oldPath = ProcessInfo.processInfo.environment["PATH"] ?? "/usr/bin:/bin"
        setenv("PATH", "\(dir.path):\(oldPath)", 1)
        defer { setenv("PATH", oldPath, 1) }

        let runner = MachineRunner(provider: codex, locator: BinaryLocator(provider: codex))
        do {
            _ = try await runner.complete(system: "s", prompt: "q", model: "gpt-6.1-sol")
            XCTFail("the refusal should throw")
        } catch {
            XCTAssertEqual(String(describing: error), refused)
        }
    }
}
