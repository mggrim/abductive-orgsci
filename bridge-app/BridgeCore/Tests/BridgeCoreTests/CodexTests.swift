import XCTest
@testable import BridgeCore

/// M56, ISC-557 (the app half). Codex is the second conformance of CLIProvider,
/// held to the same real `codex exec --json` output the TS bridge's tests read
/// (Fixtures/, captured once on the owner's Mac and redacted), and routed by the
/// request's `provider` field exactly as scripts/cli-bridge.ts routes it.
final class CodexTests: XCTestCase {
    let codex = CodexProvider()

    func fixture(_ name: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("Fixtures").appendingPathComponent(name)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func testIdentityLookupAndProbes() {
        XCTAssertEqual(codex.name, "codex")
        XCTAssertEqual(codex.binaryName, "codex")
        let dirs = codex.extraSearchDirectories(home: "/h")
        XCTAssertTrue(dirs.contains("/h/.codex/bin"))
        XCTAssertTrue(dirs.contains("/opt/homebrew/bin"))
        XCTAssertEqual(codex.versionArguments, ["--version"])
        XCTAssertEqual(codex.signInStatusArguments, ["login", "status"])
        // `codex login status` answers on stderr, with the exit code.
        XCTAssertEqual(codex.signedIn(fromStatus: "", error: "Logged in using ChatGPT", code: 0), true)
        XCTAssertEqual(codex.signedIn(fromStatus: "", error: "Not logged in", code: 1), false)
        XCTAssertNil(codex.signedIn(fromStatus: "", error: "", code: 2))
    }

    func testNpmPrefixFromNpmrc() {
        XCTAssertEqual(npmGlobalBin(npmrc: "registry=x\nprefix=/Users/r/.local/opt/node\n", home: "/Users/r"),
                       "/Users/r/.local/opt/node/bin")
        XCTAssertEqual(npmGlobalBin(npmrc: "prefix = ~/.npm-global", home: "/Users/r"), "/Users/r/.npm-global/bin")
        XCTAssertNil(npmGlobalBin(npmrc: "registry=x", home: "/Users/r"))
    }

    func testModelsMatchTheTSBridge() {
        XCTAssertEqual(codexModels, ["gpt-5.6-sol", "gpt-6.1-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5"])
        XCTAssertEqual(defaultCodexModel, "gpt-5.6-sol")
        XCTAssertEqual(codexModel(nil), "gpt-5.6-sol")
        XCTAssertEqual(codexModel(.string("gpt-5.5")), "gpt-5.5")
        XCTAssertNil(codexModel(.string("sonnet")))
        XCTAssertNil(codexModel(.number(5)))
    }

    func testRunArgumentsAndWorkspace() throws {
        let run = try codex.prepareRun(system: "You are the creed.", model: "gpt-5.6-sol", streaming: true)
        defer { run.cleanup() }
        let a = run.arguments
        XCTAssertEqual(Array(a.prefix(4)), ["exec", "--json", "-m", "gpt-5.6-sol"])
        XCTAssertEqual(a[a.firstIndex(of: "-s")! + 1], "read-only")
        XCTAssertEqual(a[a.firstIndex(of: "-C")! + 1], run.directory.path)
        for flag in ["--ephemeral", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check"] {
            XCTAssertTrue(a.contains(flag), flag)
        }
        XCTAssertEqual(a.last, "-")
        // The creed is Codex's instructions, in a file beside the empty working directory.
        let kv = try XCTUnwrap(a.first { $0.hasPrefix("model_instructions_file=") })
        XCTAssertEqual(a[a.firstIndex(of: kv)! - 1], "-c")
        let path = String(kv.dropFirst("model_instructions_file=\"".count).dropLast())
        XCTAssertEqual(try String(contentsOfFile: path, encoding: .utf8), "You are the creed.")
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: run.directory.path), [])
        for kv in ["include_permissions_instructions=false", "include_environment_context=false",
                   "skills.include_instructions=false", "skills.bundled.enabled=false", #"web_search="disabled""#] {
            XCTAssertEqual(a[a.firstIndex(of: kv)! - 1], "-c", kv)
        }
        for f in ["plugins", "hooks", "shell_tool", "unified_exec", "multi_agent", "memories"] {
            XCTAssertEqual(a[a.firstIndex(of: f)! - 1], "--disable", f)
        }
        run.cleanup()
        XCTAssertFalse(FileManager.default.fileExists(atPath: path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: run.directory.path))
    }

    func testArgumentsEqualTheTSBridge() {
        // The same list, in the same order, as codexArguments in scripts/cli-bridge.ts.
        XCTAssertEqual(codexArguments(model: "gpt-5.5", instructionsFile: "/t/i.md", workDir: "/t/w"), [
            "exec", "--json", "-m", "gpt-5.5", "-s", "read-only",
            "--ephemeral", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check",
            "-C", "/t/w", "-c", #"model_instructions_file="/t/i.md""#,
            "-c", "include_permissions_instructions=false", "-c", "include_apps_instructions=false",
            "-c", "include_environment_context=false", "-c", "include_collaboration_mode_instructions=false",
            "-c", "skills.include_instructions=false", "-c", "skills.bundled.enabled=false", "-c", #"web_search="disabled""#,
            "--disable", "plugins", "--disable", "multi_agent", "--disable", "multi_agent_v2", "--disable", "apps",
            "--disable", "hooks", "--disable", "shell_tool", "--disable", "unified_exec", "--disable", "code_mode_host",
            "--disable", "browser_use", "--disable", "computer_use", "--disable", "image_generation",
            "--disable", "tool_suggest", "--disable", "in_app_browser", "--disable", "goals", "--disable", "memories",
            "-",
        ])
        XCTAssertFalse(codexArguments(model: "gpt-5.5", instructionsFile: nil, workDir: "/w").contains { $0.hasPrefix("model_instructions_file") })
    }

    func testEnvironment() {
        let env = codex.cleanEnvironment([
            "PATH": "/usr/bin", "HOME": "/Users/r", "CLAUDECODE": "1", "CLAUDE_CODE_ENTRYPOINT": "cli",
            "CODEX_SANDBOX": "seatbelt", "CODEX_HOME": "/Users/r/.codex", "OPENAI_API_KEY": "sk-x", "CODEX_API_KEY": "sk-y",
        ])
        XCTAssertEqual(env, ["PATH": "/usr/bin", "HOME": "/Users/r", "CODEX_HOME": "/Users/r/.codex"])
    }

    func testReduceCompleteOnRealOutput() throws {
        let r = try codex.reduceComplete(output: fixture("codex-reply.jsonl"), requested: "gpt-5.6-sol")
        XCTAssertEqual(r.model, "gpt-5.6-sol")
        XCTAssertEqual(r.text.count, 620)
        XCTAssertTrue(r.text.hasPrefix("Abductive reasoning"))
        XCTAssertThrowsError(try codex.reduceComplete(output: fixture("codex-bad-model.jsonl"), requested: "x")) { e in
            XCTAssertTrue(String(describing: e).contains("not supported when using Codex with a ChatGPT account"))
        }
        XCTAssertThrowsError(try codex.reduceComplete(output: fixture("codex-signed-out.jsonl"), requested: "x"))
        XCTAssertTrue(codex.failure(output: try fixture("codex-signed-out.jsonl"), stderr: "ignored").contains("401"))
        XCTAssertEqual(codex.failure(output: try fixture("codex-reply.jsonl"), stderr: "from stderr"), "from stderr")
    }

    func testStreamReducerOnRealOutput() throws {
        let reducer = codex.makeStreamReducer(model: "gpt-5.6-sol")
        var events = try fixture("codex-reply.jsonl").split(separator: "\n").flatMap { reducer.line(String($0)) }
        events += reducer.end()
        XCTAssertEqual(events.count, 2)
        guard case .delta(let d) = events[0], case .final(let text, let model) = events[1] else { return XCTFail("\(events)") }
        XCTAssertEqual(text, d)
        XCTAssertEqual(model, "gpt-5.6-sol")

        let failing = codex.makeStreamReducer(model: "gpt-5.6-sol")
        var bad = try fixture("codex-signed-out.jsonl").split(separator: "\n").flatMap { failing.line(String($0)) }
        bad += failing.end()
        XCTAssertEqual(bad.count, 1)
        guard case .error = bad[0] else { return XCTFail("\(bad)") }
        XCTAssertTrue(failing.failed)
    }

    func testTheThreeWordProbe() throws {
        let turns = try fixture("codex-three-words.jsonl").components(separatedBy: "\n")
            .split { $0.contains("\"turn.completed\"") }
            .map { $0.joined(separator: "\n") }
        let replies = try turns.filter { $0.contains("agent_message") }.map { try codex.reduceComplete(output: $0, requested: "gpt-5.6-sol").text }
        XCTAssertEqual(replies, ["AI assistant, helping.", "Plants convert sunlight."])
    }

    func testClaudeStreamReducerKeepsItsBehaviour() {
        let r = ClaudeProvider().makeStreamReducer(model: "sonnet")
        XCTAssertEqual(r.line(#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"text":"a"}}}"#), [.delta("a")])
        XCTAssertEqual(r.end(), [])
        XCTAssertFalse(r.failed)
    }
}

/// Routing: the handler picks the lane from `provider`, as the TS bridge does.
final class CodexRoutingTests: XCTestCase {
    func req(_ path: String, _ body: String) -> BridgeRequest {
        BridgeRequest(method: "POST", uri: path, headers: ["content-type": "application/json"], body: Data(body.utf8))
    }

    func text(_ r: BridgeResponse) -> String {
        if case .bytes(let d) = r.body { return String(decoding: d, as: UTF8.self) }
        return "<stream>"
    }

    func testProviderPicksTheRunner() async {
        let claude = FakeRunner(), codex = FakeRunner()
        codex.result = .success((text: "hi", model: "gpt-5.6-sol"))
        let h = BridgeHandler(probes: FakeProbes(version: "c", signed: true), runner: claude,
                              codexProbes: FakeProbes(version: "codex-cli 0.146.0", signed: true), codexRunner: codex,
                              appVersion: "app 1.2.0")
        let r = await h.handle(req("/complete", #"{"provider":"codex","system":"S","messages":[{"role":"user","content":"q"}]}"#))
        XCTAssertEqual(text(r), #"{"text":"hi","model":"gpt-5.6-sol","modelVersion":"gpt-5.6-sol"}"#)
        XCTAssertEqual(codex.lastModel, "gpt-5.6-sol")
        XCTAssertEqual(codex.lastSystem, "S")
        XCTAssertEqual(claude.ran, 0)
        _ = await h.handle(req("/complete", #"{"messages":[]}"#))
        XCTAssertEqual(claude.ran, 1)
        XCTAssertEqual(claude.lastModel, "sonnet")
    }

    func testRefusedBeforeAnythingRuns() async {
        let claude = FakeRunner(), codex = FakeRunner()
        let h = BridgeHandler(probes: FakeProbes(version: "c", signed: true), runner: claude,
                              codexProbes: FakeProbes(version: "v", signed: true), codexRunner: codex, appVersion: "app 1.2.0")
        for path in ["/complete", "/stream"] {
            let unknown = await h.handle(req(path, #"{"provider":"gemini"}"#))
            XCTAssertEqual(unknown.status, 400)
            XCTAssertEqual(text(unknown), #"{"error":"cli-bridge: provider must be \"claude\", \"codex\", \"local\" or \"relay\""}"#)
            let sonnet = await h.handle(req(path, #"{"provider":"codex","model":"sonnet"}"#))
            XCTAssertEqual(sonnet.status, 400)
            XCTAssertEqual(text(sonnet), #"{"error":"cli-bridge: codex offers gpt-5.6-sol, gpt-6.1-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, not sonnet"}"#)
        }
        XCTAssertEqual(claude.ran + codex.ran, 0)
    }

    func testHealthNamesBothProviders() async {
        let codexProbes = FakeProbes(version: nil, signed: true)
        let h = BridgeHandler(probes: FakeProbes(version: "2.1.283 (Claude Code)", signed: true), runner: FakeRunner(),
                              codexProbes: codexProbes, codexRunner: FakeRunner(), appVersion: "app 1.2.0")
        let r = await h.handle(BridgeRequest(method: "GET", uri: "/health", headers: [:], body: Data()))
        XCTAssertEqual(text(r), #"{"ok":true,"claude":"2.1.283 (Claude Code)","signedIn":true,"bun":"app 1.2.0","providers":{"claude":{"version":"2.1.283 (Claude Code)","signedIn":true},"codex":{"version":null,"signedIn":null},"local":{"reachable":false,"endpoint":null,"models":[],"needsKey":false}}}"#)
        XCTAssertEqual(codexProbes.asked, 1)
    }
}
