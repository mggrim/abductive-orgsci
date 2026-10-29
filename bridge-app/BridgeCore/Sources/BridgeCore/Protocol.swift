import Foundation

// The wire protocol of scripts/cli-bridge.ts, which stays the reference. Each
// function here has a twin there with the same name and the same cases.

public let defaultBridgePort = 8787

/// Loopback only, both families; never the wildcard.
public let bridgeHostnames = ["127.0.0.1", "::1"]

/// ABDUCTIVE_BRIDGE_PORT when it is a port, else 8787.
public func bridgePort(_ env: [String: String] = ProcessInfo.processInfo.environment) -> Int {
    if let s = env["ABDUCTIVE_BRIDGE_PORT"], let n = Int(s), n > 0, n < 65536 { return n }
    return defaultBridgePort
}

/// ABDUCTIVE_BRIDGE_ORIGINS, comma-separated exact origins to allow as well.
public func extraOrigins(_ env: [String: String] = ProcessInfo.processInfo.environment) -> [String] {
    (env["ABDUCTIVE_BRIDGE_ORIGINS"] ?? "")
        .split(separator: ",", omittingEmptySubsequences: false)
        .map { $0.trimmingCharacters(in: .whitespaces) }
        .filter { !$0.isEmpty }
}

public enum CorsDecision: Equatable, Sendable { case allow, refuse, noOrigin }

private let siteHost = "abductive.pages.dev"
private let loopbackHosts: Set<String> = ["localhost", "127.0.0.1", "[::1]"]

/// Split an origin as a browser writes one into scheme and host, or nil when
/// the WHATWG URL parser would rewrite it (the TS bridge refuses those, since
/// `new URL(origin).origin !== origin`): a path, credentials, upper case, a
/// default or zero-padded port, an empty port, or a character no host has.
func canonicalOrigin(_ origin: String) -> (scheme: String, host: String)? {
    let scheme: String
    let rest: Substring
    if origin.hasPrefix("https://") { scheme = "https"; rest = origin.dropFirst(8) }
    else if origin.hasPrefix("http://") { scheme = "http"; rest = origin.dropFirst(7) }
    else { return nil }
    var host = Substring(rest)
    var port: Substring? = nil
    if rest.hasPrefix("[") {
        guard let close = rest.firstIndex(of: "]") else { return nil }
        host = rest[rest.startIndex...close]
        let after = rest[rest.index(after: close)...]
        if !after.isEmpty {
            guard after.hasPrefix(":") else { return nil }
            port = after.dropFirst()
        }
        let inner = host.dropFirst().dropLast()
        guard !inner.isEmpty, inner.allSatisfy({ "0123456789abcdef:.".contains($0) }) else { return nil }
    } else {
        if let colon = rest.lastIndex(of: ":") {
            host = rest[..<colon]
            port = rest[rest.index(after: colon)...]
        }
        guard !host.isEmpty, host.allSatisfy({ "abcdefghijklmnopqrstuvwxyz0123456789.-".contains($0) }) else { return nil }
    }
    if let p = port {
        guard !p.isEmpty, p.allSatisfy(\.isNumber), let n = Int(p), n < 65536, String(n) == p else { return nil }
        if (scheme == "http" && n == 80) || (scheme == "https" && n == 443) { return nil }
    }
    return (scheme, String(host))
}

/// Whether a browser origin may use the bridge; see `corsDecision` in the TS bridge.
public func corsDecision(_ origin: String?, extra: [String] = []) -> CorsDecision {
    guard let origin else { return .noOrigin }
    if extra.contains(origin) { return .allow }
    guard let (scheme, host) = canonicalOrigin(origin) else { return .refuse }
    if scheme == "https" {
        if host == siteHost { return .allow }
        if host.hasSuffix("." + siteHost) {
            let label = host.dropLast(siteHost.count + 1)
            if !label.isEmpty, label.allSatisfy({ "abcdefghijklmnopqrstuvwxyz0123456789-".contains($0) }) { return .allow }
        }
    }
    if loopbackHosts.contains(host) || host.hasSuffix(".localhost") { return .allow }
    return .refuse
}

/// Flags that strip the CLI's own agent identity from the session. The system
/// prompt travels via --system-prompt, which replaces the CLI's own.
public let isolationFlags = [
    "--setting-sources", "",
    "--tools", "",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--no-chrome",
]

public struct Message: Sendable {
    public let role: String
    public let content: String
    public init(role: String, content: String) { self.role = role; self.content = content }
}

/// Flatten the dialogue for `claude -p`; the system prompt is not included.
public func assembleCliPrompt(_ messages: [Message]) -> String {
    var parts = messages.map { $0.role == "user" ? $0.content : "[Assistant's prior turn]\n\($0.content)" }
    parts.append("\nOutput ONLY the response content — no preamble.")
    return parts.joined(separator: "\n\n")
}

private func systemFlags(_ system: String) -> [String] {
    system.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? [] : ["--system-prompt", system]
}

/// The arguments after `claude` for /complete.
public func completeArguments(system: String, model: String) -> [String] {
    ["-p", "--output-format", "json", "--model", model] + systemFlags(system) + isolationFlags
}

/// The arguments after `claude` for /stream.
public func streamArguments(system: String, model: String) -> [String] {
    ["-p", "--output-format", "stream-json", "--include-partial-messages", "--verbose", "--model", model]
        + systemFlags(system) + isolationFlags
}

/// Which model answered: the top-level `model`, else the `modelUsage` entry
/// naming the requested alias, else the entry with the most output.
public func resolveModel(_ parsed: JSON, requested: String) -> String {
    if let m = parsed["model"], m != .null {
        // JS keeps whatever is there; a non-string would stringify.
        return m.stringValue ?? m.serialized
    }
    guard case .object(let usage)? = parsed["modelUsage"], !usage.isEmpty else { return requested }
    let alias = requested.lowercased()
    if let hit = usage.first(where: { $0.0.lowercased().contains(alias) }) { return hit.0 }
    var best = usage[0]
    for cur in usage.dropFirst() where (cur.1["outputTokens"]?.numberValue ?? 0) > (best.1["outputTokens"]?.numberValue ?? 0) {
        best = cur
    }
    return best.0
}

public enum StreamEvent: Equatable, Sendable {
    case delta(String)
    case final(text: String, model: String)
    case error(String)
}

/// One NDJSON line from `claude --output-format stream-json`, reduced.
public func parseStreamLine(_ line: String) -> StreamEvent? {
    let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return nil }
    guard let parsed = try? JSON.parse(trimmed) else { return nil }
    if parsed["type"]?.stringValue == "stream_event" {
        let inner = parsed["event"]
        if inner?["type"]?.stringValue == "content_block_delta", let text = inner?["delta"]?["text"]?.stringValue {
            return .delta(text)
        }
        return nil
    }
    if parsed["type"]?.stringValue == "result" {
        return .final(text: parsed["result"]?.stringValue ?? "", model: resolveModel(parsed, requested: "sonnet"))
    }
    return nil
}

/// One Server-Sent Event, as the TS bridge frames it.
public func sseFrame(_ event: StreamEvent) -> String {
    switch event {
    case .delta(let t):
        return "event: delta\ndata: \(JSON.object([("text", .string(t))]).serialized)\n\n"
    case .final(let t, let m):
        return "event: final\ndata: \(JSON.object([("text", .string(t)), ("model", .string(m))]).serialized)\n\n"
    case .error(let msg):
        return "event: error\ndata: \(JSON.object([("message", .string(msg))]).serialized)\n\n"
    }
}

/// The app's version, reported in the health reply's `bun` field as "app <version>".
/// The app's Info.plist is the source when running inside the bundle.
public var bridgeAppVersion: String {
    (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "1.3.1"
}
