import Foundation

// Finding and running a provider's CLI from a GUI app, whose PATH is launchd's
// (/usr/bin:/bin:/usr/sbin:/sbin) rather than the reader's shell's. Nothing
// here names a particular CLI; that lives in the provider (Provider.swift).

/// Where to look, in order: the process PATH, then the given install places.
public func searchDirectories(path: String, extra: [String]) -> [String] {
    var dirs = path.split(separator: ":").map(String.init).filter { !$0.isEmpty }
    for d in extra where !dirs.contains(d) { dirs.append(d) }
    return dirs
}

public func claudeSearchDirectories(path: String, home: String) -> [String] {
    searchDirectories(path: path, extra: ClaudeProvider().extraSearchDirectories(home: home))
}

/// The first executable `name` in `dirs`, else the one a login shell's `which` names.
public func locateBinary(_ name: String, dirs: [String], isExecutable: (String) -> Bool,
                         loginShell: () -> String?) -> String? {
    for dir in dirs where isExecutable("\(dir)/\(name)") { return "\(dir)/\(name)" }
    if let found = loginShell(), found.hasPrefix("/"), isExecutable(found) { return found }
    return nil
}

public func locateClaude(path: String, home: String, isExecutable: (String) -> Bool,
                         loginShell: () -> String?) -> String? {
    locateBinary("claude", dirs: claudeSearchDirectories(path: path, home: home),
                 isExecutable: isExecutable, loginShell: loginShell)
}

/// Ask the reader's login shell, bounded, for `which <name>`.
func loginShellWhich(_ name: String, timeout: TimeInterval = 5) -> String? {
    let env = ProcessInfo.processInfo.environment
    let shell = env["SHELL"].flatMap { $0.hasPrefix("/") ? $0 : nil } ?? "/bin/zsh"
    for flags in [["-l", "-c"], ["-l", "-i", "-c"]] {
        guard let r = runProcess(shell, flags + ["command -v \(name)"], env: env, timeout: timeout), r.code == 0 else { continue }
        let line = r.out.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.last { $0.hasPrefix("/") }
        if let line { return line }
    }
    return nil
}

/// A provider's binary, looked for again each time until found once.
///
/// The PATH and the install places are checked inline, since that is a handful
/// of stat calls. The login shell is asked in the background, at most once a
/// minute, because a shell that reads the reader's profile can take seconds and
/// the page gives up on a health probe after five.
public final class BinaryLocator: @unchecked Sendable {
    let provider: CLIProvider
    private let lock = NSLock()
    private var found: String?
    private var fromShell: String?
    private var shellAsked: Date?
    private var shellBusy = false

    public init(provider: CLIProvider) { self.provider = provider }

    public func path() -> String? {
        lock.lock()
        if let f = found { lock.unlock(); return f }
        let shellAnswer = fromShell
        lock.unlock()
        let env = ProcessInfo.processInfo.environment
        let fm = FileManager.default
        let home = env["HOME"] ?? fm.homeDirectoryForCurrentUser.path
        let p = locateBinary(provider.binaryName,
                             dirs: searchDirectories(path: env["PATH"] ?? "", extra: provider.extraSearchDirectories(home: home)),
                             isExecutable: { fm.isExecutableFile(atPath: $0) }, loginShell: { shellAnswer })
        lock.lock()
        found = p
        let ask = p == nil && !shellBusy && (shellAsked.map { Date().timeIntervalSince($0) > 60 } ?? true)
        if ask { shellBusy = true; shellAsked = Date() }
        lock.unlock()
        if ask {
            let name = provider.binaryName
            DispatchQueue.global().async {
                let answer = loginShellWhich(name)
                self.lock.lock(); self.fromShell = answer; self.shellBusy = false; self.lock.unlock()
            }
        }
        return p
    }
}

/// The environment a CLI runs in: the provider's cleaning of this process's,
/// with the binary's own directory and the install places on PATH (an
/// npm-installed CLI is a node script that needs its node beside it).
public func providerEnvironment(_ env: [String: String], provider: CLIProvider, binaryPath: String) -> [String: String] {
    var out = provider.cleanEnvironment(env)
    let home = env["HOME"] ?? FileManager.default.homeDirectoryForCurrentUser.path
    var dirs = [(binaryPath as NSString).deletingLastPathComponent]
    for d in searchDirectories(path: env["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin",
                               extra: provider.extraSearchDirectories(home: home)) where !dirs.contains(d) {
        dirs.append(d)
    }
    out["PATH"] = dirs.joined(separator: ":")
    return out
}

public func cleanedEnvironment(_ env: [String: String], claudePath: String) -> [String: String] {
    providerEnvironment(env, provider: ClaudeProvider(), binaryPath: claudePath)
}

struct ProcessResult { let code: Int32; let out: String; let err: String }

/// Run a command to the end, with stdin given and a kill after `timeout`.
/// nil when it cannot start at all.
func runProcess(_ exe: String, _ args: [String], env: [String: String], stdin: Data? = nil,
                timeout: TimeInterval? = nil, directory: URL? = nil) -> ProcessResult? {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: exe)
    p.arguments = args
    p.environment = env
    // Neutral cwd: a CLAUDE.md in the launch directory would be read as project memory.
    p.currentDirectoryURL = directory ?? FileManager.default.temporaryDirectory
    let out = Pipe(), err = Pipe(), inp = Pipe()
    p.standardOutput = out
    p.standardError = err
    p.standardInput = stdin == nil ? FileHandle.nullDevice : inp
    do { try p.run() } catch { return nil }
    if let stdin {
        DispatchQueue.global().async {
            try? inp.fileHandleForWriting.write(contentsOf: stdin)
            try? inp.fileHandleForWriting.close()
        }
    }
    var timer: DispatchWorkItem?
    if let timeout {
        let t = DispatchWorkItem { if p.isRunning { p.terminate() } }
        DispatchQueue.global().asyncAfter(deadline: .now() + timeout, execute: t)
        timer = t
    }
    var errData = Data()
    let g = DispatchGroup()
    g.enter()
    DispatchQueue.global().async { errData = err.fileHandleForReading.readDataToEndOfFile(); g.leave() }
    let outData = out.fileHandleForReading.readDataToEndOfFile()
    g.wait()
    p.waitUntilExit()
    timer?.cancel()
    return ProcessResult(code: p.terminationStatus, out: String(decoding: outData, as: UTF8.self),
                         err: String(decoding: errData, as: UTF8.self))
}

struct CLIError: Error, CustomStringConvertible { let description: String }

/// Runs a provider's CLI for /complete and /stream.
public final class MachineRunner: ClaudeRunning, @unchecked Sendable {
    let provider: CLIProvider
    let locator: BinaryLocator
    public init(provider: CLIProvider, locator: BinaryLocator) { self.provider = provider; self.locator = locator }

    private func binary() throws -> String {
        // The TS bridge spawning a missing binary fails the same way: an error the page shows.
        guard let c = locator.path() else { throw CLIError(description: "Executable not found in $PATH: \"\(provider.binaryName)\"") }
        return c
    }

    private func exitError(_ code: Int32, _ stderr: String) -> String {
        "\(provider.name) CLI exited \(code): \(String(stderr.prefix(400)))"
    }

    public func complete(system: String, prompt: String, model: String) async throws -> (text: String, model: String) {
        let exe = try binary()
        let env = providerEnvironment(ProcessInfo.processInfo.environment, provider: provider, binaryPath: exe)
        let run = try provider.prepareRun(system: system, model: model, streaming: false)
        defer { run.cleanup() }
        let r: ProcessResult? = await withCheckedContinuation { c in
            DispatchQueue.global().async {
                c.resume(returning: runProcess(exe, run.arguments, env: env, stdin: Data(prompt.utf8), directory: run.directory))
            }
        }
        guard let r else { throw CLIError(description: "Executable not found in $PATH: \"\(provider.binaryName)\"") }
        // A turn the CLI refused in its own words reaches the page in those words (ISC-591).
        if let own = provider.ownFailure(output: r.out) { throw CLIError(description: own) }
        if r.code != 0 { throw CLIError(description: exitError(r.code, provider.failure(output: r.out, stderr: r.err))) }
        do { return try provider.reduceComplete(output: r.out, requested: model) } catch {
            throw CLIError(description: exitError(r.code, String(describing: error)))
        }
    }

    public func stream(system: String, prompt: String, model: String) -> AsyncStream<StreamEvent> {
        let provider = self.provider
        return AsyncStream { continuation in
            let exe: String
            do { exe = try binary() } catch {
                continuation.yield(.error(String(describing: error)))
                continuation.finish()
                return
            }
            let run: CLIRun
            do { run = try provider.prepareRun(system: system, model: model, streaming: true) } catch {
                continuation.yield(.error(String(describing: error)))
                continuation.finish()
                return
            }
            let reducer = provider.makeStreamReducer(model: model)
            let p = Process()
            p.executableURL = URL(fileURLWithPath: exe)
            p.arguments = run.arguments
            p.environment = providerEnvironment(ProcessInfo.processInfo.environment, provider: provider, binaryPath: exe)
            p.currentDirectoryURL = run.directory
            let out = Pipe(), err = Pipe(), inp = Pipe()
            p.standardOutput = out
            p.standardError = err
            p.standardInput = inp
            do { try p.run() } catch {
                run.cleanup()
                continuation.yield(.error(error.localizedDescription))
                continuation.finish()
                return
            }
            // A reader who closes the page stops the CLI with it.
            continuation.onTermination = { _ in if p.isRunning { p.terminate() } }
            DispatchQueue.global().async {
                try? inp.fileHandleForWriting.write(contentsOf: Data(prompt.utf8))
                try? inp.fileHandleForWriting.close()
            }
            var errData = Data()
            let g = DispatchGroup()
            g.enter()
            DispatchQueue.global().async { errData = err.fileHandleForReading.readDataToEndOfFile(); g.leave() }
            DispatchQueue.global().async {
                // Lines are reassembled across chunk boundaries: half a line is unparseable JSON.
                var buffer = Data()
                let handle = out.fileHandleForReading
                while true {
                    let chunk = handle.availableData
                    if chunk.isEmpty { break }
                    buffer.append(chunk)
                    while let nl = buffer.firstIndex(of: 0x0A) {
                        let line = String(decoding: buffer[buffer.startIndex..<nl], as: UTF8.self)
                        buffer = Data(buffer[buffer.index(after: nl)...])
                        for e in reducer.line(line) { continuation.yield(e) }
                    }
                }
                for e in reducer.line(String(decoding: buffer, as: UTF8.self)) + reducer.end() { continuation.yield(e) }
                g.wait()
                p.waitUntilExit()
                run.cleanup()
                if p.terminationStatus != 0 && !reducer.failed {
                    continuation.yield(.error(self.exitError(p.terminationStatus, String(decoding: errData, as: UTF8.self))))
                }
                continuation.finish()
            }
        }
    }
}

/// A provider's probes. A yes is cached for the app's life; a no is asked again
/// each time, because the reader is on the way to fixing it.
public final class MachineProbes: HealthProbes, @unchecked Sendable {
    let provider: CLIProvider
    let locator: BinaryLocator
    private let lock = NSLock()
    private var version: String?
    private var signed = false

    public init(provider: CLIProvider, locator: BinaryLocator) { self.provider = provider; self.locator = locator }

    private func short(_ args: [String]) async -> ProcessResult? {
        guard let exe = locator.path() else { return nil }
        let env = providerEnvironment(ProcessInfo.processInfo.environment, provider: provider, binaryPath: exe)
        return await withCheckedContinuation { c in
            DispatchQueue.global().async { c.resume(returning: runProcess(exe, args, env: env, timeout: 10)) }
        }
    }

    public func claudeVersion() async -> String? {
        if let v = lock.withLock({ version }) { return v }
        guard let r = await short(provider.versionArguments), r.code == 0 else { return nil }
        let v = r.out.trimmingCharacters(in: .whitespacesAndNewlines)
        if v.isEmpty { return nil }
        lock.withLock { version = v }
        return v
    }

    public func signedIn() async -> Bool? {
        if lock.withLock({ signed }) { return true }
        if let status = await short(provider.signInStatusArguments),
           let answer = provider.signedIn(fromStatus: status.out, error: status.err, code: status.code) {
            lock.withLock { signed = answer }
            return answer
        }
        // A CLI without a status command: one bounded call. Signed out exits non-zero.
        guard let call = await short(provider.signInFallbackArguments) else { return nil }
        let ok = call.code == 0
        lock.withLock { signed = ok }
        return ok
    }
}
