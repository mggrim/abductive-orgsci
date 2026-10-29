import Foundation

/// One command-line model the bridge can run. Everything that knows it is
/// talking to a particular CLI lives in a conformance; `MachineProbes`,
/// `MachineRunner` and `BinaryLocator` run whichever provider they are given.
/// Two lanes since M56: Claude Code (`ClaudeProvider`) and OpenAI's Codex CLI
/// (`CodexProvider`). The health reply keeps its M54 shape for the Claude lane
/// (`claude`, `signedIn`) and reports both under `providers`.
public protocol CLIProvider: Sendable {
    /// Short, stable name, e.g. "claude". It is also the request's `provider` value.
    var name: String { get }
    /// The executable's file name, looked up on PATH and in `extraSearchDirectories`.
    var binaryName: String { get }
    /// Where this CLI's installers put it, beyond the process PATH.
    func extraSearchDirectories(home: String) -> [String]
    /// Arguments whose stdout is the version string.
    var versionArguments: [String] { get }
    /// Arguments for a quick, bounded sign-in check, read by `signedIn(fromStatus:error:code:)`.
    var signInStatusArguments: [String] { get }
    /// true or false when the status output says; nil when it cannot tell.
    func signedIn(fromStatus output: String, error: String, code: Int32) -> Bool?
    /// A bounded real call whose exit code answers sign-in when the status check cannot.
    var signInFallbackArguments: [String] { get }
    /// argv after the binary, and where it runs, for one /complete or /stream
    /// call; the prompt goes on stdin. `cleanup` runs once the process has exited.
    func prepareRun(system: String, model: String, streaming: Bool) throws -> CLIRun
    /// The /complete reply from the CLI's whole stdout, after a clean exit.
    func reduceComplete(output: String, requested: String) throws -> (text: String, model: String)
    /// What an error says after the CLI failed: stderr, unless the CLI reports failures on stdout.
    func failure(output: String, stderr: String) -> String
    /// The CLI's own sentence for a refused turn, passed to the page unchanged (ISC-591); nil when it gave none.
    func ownFailure(output: String) -> String?
    /// A reducer for one streaming run's stdout, line by line.
    func makeStreamReducer(model: String) -> StreamReducing
    /// The environment the CLI runs in, from this process's.
    func cleanEnvironment(_ env: [String: String]) -> [String: String]
}

extension CLIProvider {
    /// A CLI that reports no turn failure of its own on stdout.
    public func ownFailure(output: String) -> String? { nil }

    /// The status output alone, for a CLI that answers in its stdout.
    public func signedIn(fromStatus output: String) -> Bool? { signedIn(fromStatus: output, error: "", code: 0) }
}

/// One run's argv and working directory, and what to remove afterwards.
public struct CLIRun: Sendable {
    public let arguments: [String]
    public let directory: URL
    public let cleanup: @Sendable () -> Void
}

/// Reduces a streaming run's stdout to the events the page reads.
public protocol StreamReducing: AnyObject {
    func line(_ line: String) -> [StreamEvent]
    /// Whatever the run's end releases, e.g. a final that needs the whole text.
    func end() -> [StreamEvent]
    /// True once the CLI reported a failure on stdout, so no second error follows.
    var failed: Bool { get }
}

struct ProviderError: Error, CustomStringConvertible { let description: String }

// MARK: - Claude Code

/// Claude Code: `claude -p`, with the isolation flags, the sign-in probe and
/// the reducers of scripts/cli-bridge.ts.
public struct ClaudeProvider: CLIProvider {
    public init() {}
    public let name = "claude"
    public let binaryName = "claude"

    public func extraSearchDirectories(home: String) -> [String] {
        ["\(home)/.local/bin", "/usr/local/bin", "/opt/homebrew/bin", "\(home)/.claude/local/bin",
         "\(home)/.claude/local", "\(home)/.npm-global/bin"]
    }

    public let versionArguments = ["--version"]
    // `claude auth status` prints {"loggedIn": bool, ...} in 2.1.x.
    public let signInStatusArguments = ["auth", "status"]

    public func signedIn(fromStatus output: String, error: String, code: Int32) -> Bool? {
        guard let parsed = try? JSON.parse(output.trimmingCharacters(in: .whitespacesAndNewlines)),
              case .bool(let loggedIn)? = parsed["loggedIn"] else { return nil }
        return loggedIn
    }

    public var signInFallbackArguments: [String] { ["-p", "Reply with OK.", "--model", "haiku"] + isolationFlags }

    public func prepareRun(system: String, model: String, streaming: Bool) throws -> CLIRun {
        // Neutral cwd: a CLAUDE.md in the launch directory would be read as project memory.
        CLIRun(arguments: streaming ? streamArguments(system: system, model: model) : completeArguments(system: system, model: model),
               directory: FileManager.default.temporaryDirectory, cleanup: {})
    }

    public func reduceComplete(output: String, requested: String) throws -> (text: String, model: String) {
        guard let parsed = try? JSON.parse(output) else { return (output, requested) }
        return (parsed["result"]?.stringValue ?? output, resolveModel(parsed, requested: requested))
    }

    public func failure(output: String, stderr: String) -> String { stderr }

    public func makeStreamReducer(model: String) -> StreamReducing { ClaudeStreamReducer() }

    /// Without the markers that make the CLI refuse to nest inside a Claude Code session.
    public func cleanEnvironment(_ env: [String: String]) -> [String: String] {
        env.filter { $0.key != "CLAUDECODE" && !$0.key.hasPrefix("CLAUDE_CODE") }
    }
}

final class ClaudeStreamReducer: StreamReducing {
    func line(_ line: String) -> [StreamEvent] { parseStreamLine(line).map { [$0] } ?? [] }
    func end() -> [StreamEvent] { [] }
    let failed = false
}

// MARK: - Codex

/// The models the Codex lane offers, the same list as CODEX_MODELS in scripts/cli-bridge.ts:
/// the four codex-cli 0.146.0 lists for a ChatGPT sign-in, the first its default, and
/// gpt-6.1-sol (ISC-591), which the API serves and a ChatGPT sign-in refuses in its own words.
public let codexModels = ["gpt-5.6-sol", "gpt-6.1-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5"]
public let defaultCodexModel = "gpt-5.6-sol"

/// The model a Codex turn runs on: the one named if Codex offers it, the default if none; else nil.
public func codexModel(_ requested: JSON?) -> String? {
    guard let requested else { return defaultCodexModel }
    guard let s = requested.stringValue, codexModels.contains(s) else { return nil }
    return s
}

private let codexConfig = [
    "include_permissions_instructions=false",
    "include_apps_instructions=false",
    "include_environment_context=false",
    "include_collaboration_mode_instructions=false",
    "skills.include_instructions=false",
    "skills.bundled.enabled=false",
    #"web_search="disabled""#,
]

private let codexDisabled = [
    "plugins", "multi_agent", "multi_agent_v2", "apps", "hooks", "shell_tool", "unified_exec",
    "code_mode_host", "browser_use", "computer_use", "image_generation", "tool_suggest",
    "in_app_browser", "goals", "memories",
]

/// argv after `codex`, the same list as `codexArguments` in scripts/cli-bridge.ts.
public func codexArguments(model: String, instructionsFile: String?, workDir: String) -> [String] {
    var a = ["exec", "--json", "-m", model, "-s", "read-only",
             "--ephemeral", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check", "-C", workDir]
    if let instructionsFile { a += ["-c", "model_instructions_file=\(JSON.string(instructionsFile).serialized)"] }
    for kv in codexConfig { a += ["-c", kv] }
    for f in codexDisabled { a += ["--disable", f] }
    return a + ["-"]
}

/// The bin directory of the npm global prefix a `~/.npmrc` names, if it names one.
public func npmGlobalBin(npmrc: String, home: String) -> String? {
    for line in npmrc.split(separator: "\n") {
        let parts = line.split(separator: "=", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
        guard parts.count == 2, parts[0] == "prefix", !parts[1].isEmpty else { continue }
        let prefix = parts[1].hasPrefix("~/") ? home + parts[1].dropFirst(1) : parts[1]
        return prefix + "/bin"
    }
    return nil
}

private func codexEvents(_ output: String) -> [JSON] {
    output.split(separator: "\n").compactMap { try? JSON.parse(String($0)) }
}

/// The agent's text, or nil for any other event. Item errors are notices, not failures.
private func agentText(_ e: JSON) -> String? {
    guard e["type"]?.stringValue == "item.completed", e["item"]?["type"]?.stringValue == "agent_message" else { return nil }
    return e["item"]?["text"]?.stringValue
}

private func failureMessage(_ e: JSON) -> String? {
    guard e["type"]?.stringValue == "turn.failed" else { return nil }
    return codexFailureSentence(e["error"]?["message"]?.stringValue ?? "the turn failed")
}

/// The CLI's own sentence out of a failed turn's message (ISC-591), as
/// `codexFailureSentence` in scripts/cli-bridge.ts: Codex carries the API's error
/// body as a JSON string, and the sentence is `error.message` inside it. A message
/// that is not such a body is Codex's sentence already.
public func codexFailureSentence(_ message: String) -> String {
    guard let body = try? JSON.parse(message) else { return message }
    if let inner = body["error"]?["message"]?.stringValue ?? body["message"]?.stringValue,
       !inner.trimmingCharacters(in: .whitespaces).isEmpty {
        return inner
    }
    return message
}

/// OpenAI's Codex CLI: `codex exec`, one non-interactive run in an empty
/// directory, the study's system prompt as its model instructions (M56 probe),
/// every tool and every source of the reader's own Codex setup switched off.
/// The argv is `codexArguments` above, the same list as the TS bridge's, whose
/// docstring records the three facts: the probe turn went from 14,552 input
/// tokens to about 4,890; one catalog note on sub-agents ("You are `/root`, the
/// primary agent in a team of agents collaborating to fulfill the user's goals.")
/// stays, and no key removes it; and Codex's JSONL never names the model, so the
/// model reported is the one requested with -m.
public struct CodexProvider: CLIProvider {
    public init() {}
    public let name = "codex"
    public let binaryName = "codex"

    public func extraSearchDirectories(home: String) -> [String] {
        var dirs = ["\(home)/.codex/bin"]
        if let npmrc = try? String(contentsOfFile: "\(home)/.npmrc", encoding: .utf8), let bin = npmGlobalBin(npmrc: npmrc, home: home) {
            dirs.append(bin)
        }
        return dirs + ["\(home)/.npm-global/bin", "\(home)/.local/bin", "/opt/homebrew/bin", "/usr/local/bin"]
    }

    public let versionArguments = ["--version"]
    public let signInStatusArguments = ["login", "status"]

    /// `codex login status` answers on stderr: "Logged in using ChatGPT", exit 0, or "Not logged in", exit 1.
    public func signedIn(fromStatus output: String, error: String, code: Int32) -> Bool? {
        let text = output + "\n" + error
        if code == 0 && text.contains("Logged in") { return true }
        if text.contains("Not logged in") || code == 1 { return false }
        return nil
    }

    public var signInFallbackArguments: [String] { signInStatusArguments }

    public func prepareRun(system: String, model: String, streaming: Bool) throws -> CLIRun {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent("abductive-codex-\(UUID().uuidString)")
        let work = root.appendingPathComponent("work")
        try fm.createDirectory(at: work, withIntermediateDirectories: true)
        var instructions: String? = nil
        if !system.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let file = root.appendingPathComponent("instructions.md")
            try Data(system.utf8).write(to: file)
            instructions = file.path
        }
        let path = root.path
        return CLIRun(arguments: codexArguments(model: model, instructionsFile: instructions, workDir: work.path),
                      directory: work, cleanup: { try? FileManager.default.removeItem(atPath: path) })
    }

    public func reduceComplete(output: String, requested: String) throws -> (text: String, model: String) {
        var texts: [String] = []
        var failed: String? = nil
        for e in codexEvents(output) {
            if let t = agentText(e) { texts.append(t) }
            if let f = failureMessage(e) { failed = f }
        }
        if let failed { throw ProviderError(description: failed) }
        if texts.isEmpty { throw ProviderError(description: "codex gave no reply") }
        return (texts.joined(separator: "\n\n"), requested)
    }

    /// A failed turn's sentence, from the JSONL.
    public func ownFailure(output: String) -> String? {
        var failed: String? = nil
        for e in codexEvents(output) { if let f = failureMessage(e) { failed = f } }
        return failed
    }

    /// Codex writes a failed turn's reason into the JSONL, not stderr.
    public func failure(output: String, stderr: String) -> String {
        do { _ = try reduceComplete(output: output, requested: ""); return stderr } catch { return String(describing: error) }
    }

    public func makeStreamReducer(model: String) -> StreamReducing { CodexStreamReducer(model: model) }

    /// Without the Claude Code markers, the CODEX_* variables a Codex session
    /// sets for its children, and API keys, so the turn bills the ChatGPT
    /// sign-in. CODEX_HOME stays: the sign-in lives there.
    public func cleanEnvironment(_ env: [String: String]) -> [String: String] {
        env.filter { k, _ in
            k != "CLAUDECODE" && !k.hasPrefix("CLAUDE_CODE") && (!k.hasPrefix("CODEX_") || k == "CODEX_HOME") && k != "OPENAI_API_KEY"
        }
    }
}

/// `codex exec` sends each message whole, so a message is one delta; the final,
/// once the run ends, carries the whole text and the model.
final class CodexStreamReducer: StreamReducing {
    let model: String
    private var texts: [String] = []
    private(set) var failed = false
    init(model: String) { self.model = model }

    func line(_ line: String) -> [StreamEvent] {
        guard let e = try? JSON.parse(line.trimmingCharacters(in: .whitespacesAndNewlines)) else { return [] }
        if let t = agentText(e) {
            let delta = texts.isEmpty ? t : "\n\n" + t
            texts.append(t)
            return [.delta(delta)]
        }
        if let f = failureMessage(e), !failed {
            failed = true
            return [.error(f)]
        }
        return []
    }

    func end() -> [StreamEvent] {
        failed || texts.isEmpty ? [] : [.final(text: texts.joined(separator: "\n\n"), model: model)]
    }
}
