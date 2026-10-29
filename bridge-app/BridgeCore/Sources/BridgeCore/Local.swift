import Foundation

// The local lane (M60, ISC-577): an OpenAI-compatible model server on this
// machine (Ollama, LM Studio, llama.cpp's server), the twin of the section of
// scripts/cli-bridge.ts that begins "The local lane (M60". Every function here
// has a twin there with the same name and the same cases.
//
// Loopback in both directions: the bridge sends a local turn only to 127.0.0.1
// or ::1, never to its own port, so nothing a study says leaves the machine on
// this lane. A key the reader types for a server that asks for one arrives in
// the request, goes into the Authorization header of the one request relayed,
// and is held nowhere else: no file, no log, no property that outlives the call.

/// Where local servers listen by default, in the order the bridge asks.
public let localPorts = [11434, 1234, 8080, 8000]

private let localNames: [Int: String] = [11434: "Ollama", 1234: "LM Studio", 8080: "llama.cpp"]

/// How long one probe of one port may take before that port counts as silent.
public let localProbeTimeout: TimeInterval = 1.5

/// The server's name for the card and the record: Ollama, LM Studio, llama.cpp, or "port N".
public func localServerName(_ endpoint: String) -> String {
    let port = Int(endpoint.split(separator: ":").last ?? "") ?? 0
    return localNames[port] ?? "port \(port)"
}

/// A named endpoint as one canonical base, http://127.0.0.1:<port> or
/// http://[::1]:<port>, or nil when it is not a port on this machine. Takes a
/// bare port, host:port, or an http URL on localhost, 127.0.0.1 or [::1] whose
/// path is empty or /v1; `ownPort` is refused.
public func loopbackEndpoint(_ raw: JSON?, ownPort: Int? = nil) -> String? {
    var text: String
    switch raw {
    case .number(let n)?:
        guard n == n.rounded(), n > 0, n < 65536 else { return nil }
        text = String(Int(n))
    case .string(let s)?:
        text = s.trimmingCharacters(in: .whitespaces)
    default:
        return nil
    }
    if !text.isEmpty, text.allSatisfy(\.isNumber) {
        text = "http://127.0.0.1:\(text)"
    } else if text.range(of: #"^(localhost|127\.0\.0\.1|\[::1\]):\d+$"#, options: .regularExpression) != nil {
        text = "http://\(text)"
    }
    // http://host:port with an optional /, /v1 or /v1/, and nothing else.
    let pattern = #"^http://(localhost|127\.0\.0\.1|\[::1\]):(\d{1,5})(/|/v1|/v1/)?$"#
    guard let match = text.range(of: pattern, options: .regularExpression), match == text.startIndex..<text.endIndex else {
        return nil
    }
    let afterScheme = text.dropFirst("http://".count)
    let host: String
    let rest: Substring
    if afterScheme.hasPrefix("[::1]") { host = "[::1]"; rest = afterScheme.dropFirst("[::1]".count) }
    else if afterScheme.hasPrefix("localhost") { host = "127.0.0.1"; rest = afterScheme.dropFirst("localhost".count) }
    else { host = "127.0.0.1"; rest = afterScheme.dropFirst("127.0.0.1".count) }
    let digits = rest.dropFirst().prefix { $0.isNumber }
    guard let port = Int(digits), port > 0, port < 65536, port != ownPort else { return nil }
    return "http://\(host):\(port)"
}

/// The endpoints to ask, in order: the named one first, then the usual ports, each once.
public func localCandidates(_ named: String?) -> [String] {
    var out: [String] = []
    for c in (named.map { [$0] } ?? []) + localPorts.map({ "http://127.0.0.1:\($0)" }) where !out.contains(c) {
        out.append(c)
    }
    return out
}

/// What /health says about the local lane.
public struct LocalHealth: Equatable, Sendable {
    public let reachable: Bool
    public let endpoint: String?
    public let models: [String]
    public let needsKey: Bool

    public init(reachable: Bool, endpoint: String?, models: [String], needsKey: Bool) {
        self.reachable = reachable
        self.endpoint = endpoint
        self.models = models
        self.needsKey = needsKey
    }

    public static let none = LocalHealth(reachable: false, endpoint: nil, models: [], needsKey: false)

    /// Whether a local turn can run: a server that answered, needs no key, and has a model.
    public var ready: Bool { reachable && !needsKey && !models.isEmpty }

    var json: JSON {
        .object([
            ("reachable", .bool(reachable)), ("endpoint", endpoint.map(JSON.string) ?? .null),
            ("models", .array(models.map(JSON.string))), ("needsKey", .bool(needsKey)),
        ])
    }
}

/// The ids in a /v1/models reply, in the server's order; a missing or null list is empty.
public func modelIds(_ reply: JSON?) -> [String] {
    guard case .array(let items)? = reply?["data"] else { return [] }
    return items.compactMap { item in
        guard let id = item["id"]?.stringValue, !id.isEmpty else { return nil }
        return id
    }
}

/// The models a chat turn can run on: LM Studio lists its embedding models
/// beside its chat models, and a chat call to one fails (`chatModelIds` in the TS bridge).
public func chatModelIds(_ ids: [String]) -> [String] {
    ids.filter { $0.range(of: "embed", options: .caseInsensitive) == nil }
}

/// The chat request, the OpenAI-compatible shape every local server reads.
public func chatRequestBody(system: String, messages: [Message], model: String, stream: Bool, maxTokens: Int? = nil) -> JSON {
    var thread: [JSON] = []
    if !system.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        thread.append(.object([("role", .string("system")), ("content", .string(system))]))
    }
    thread += messages.map { .object([("role", .string($0.role)), ("content", .string($0.content))]) }
    var pairs: [(String, JSON)] = [("model", .string(model)), ("stream", .bool(stream))]
    if let maxTokens { pairs.append(("max_tokens", .number(Double(maxTokens)))) }
    pairs.append(("messages", .array(thread)))
    return .object(pairs)
}

private func serverError(_ reply: JSON?) -> String? {
    guard let e = reply?["error"], e != .null else { return nil }
    if let s = e.stringValue { return s }
    return e["message"]?.stringValue ?? "the server reported an error"
}

public enum ChatReply: Equatable, Sendable {
    case reply(text: String, model: String)
    case error(String)
}

/// A whole /v1/chat/completions reply, reduced to the /complete reply or the server's error.
public func reduceChatCompletion(_ reply: JSON?, requested: String) -> ChatReply {
    if let failure = serverError(reply) { return .error(failure) }
    guard case .array(let choices)? = reply?["choices"], let text = choices.first?["message"]?["content"]?.stringValue else {
        return .error("the server gave no reply")
    }
    let model = reply?["model"]?.stringValue.flatMap { $0.isEmpty ? nil : $0 } ?? requested
    return .reply(text: text, model: model)
}

/// The server's SSE, line by line, to the SSE the page reads: each content piece a delta, then one final.
public final class OpenAIStreamReducer: StreamReducing {
    private var text = ""
    private var model: String
    private var any = false
    public private(set) var failed = false

    public init(requested: String) { model = requested }

    public func line(_ line: String) -> [StreamEvent] {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix("data:") else { return [] }
        let data = trimmed.dropFirst(5).trimmingCharacters(in: .whitespaces)
        if data == "[DONE]" { return [] }
        guard let chunk = try? JSON.parse(String(data)) else { return [] }
        if let failure = serverError(chunk) {
            if failed { return [] }
            failed = true
            return [.error(failure)]
        }
        if let m = chunk["model"]?.stringValue, !m.isEmpty { model = m }
        guard case .array(let choices)? = chunk["choices"], let piece = choices.first?["delta"]?["content"]?.stringValue,
              !piece.isEmpty else { return [] }
        any = true
        text += piece
        return [.delta(piece)]
    }

    public func end() -> [StreamEvent] {
        failed || !any ? [] : [.final(text: text, model: model)]
    }
}

/// A chat turn's target: a local server (M60, ISC-577) or a relayed API (ISC-580).
/// `endpoint` plus `chatPath` is the chat URL; `label` names it in errors.
public struct LocalTurn: Sendable, Equatable {
    public let endpoint: String
    public let model: String
    public let key: String?
    public let chatPath: String
    public let label: String
    public init(endpoint: String, model: String, key: String?, chatPath: String = "/v1/chat/completions", label: String? = nil) {
        self.endpoint = endpoint
        self.model = model
        self.key = key
        self.chatPath = chatPath
        self.label = label ?? localServerName(endpoint)
    }
}

/// An https API root the relay may reach, canonical and without a trailing
/// slash; nil for anything else (`relayBase` in the TS bridge).
public func relayBase(_ raw: JSON?) -> String? {
    guard let text = raw?.stringValue?.trimmingCharacters(in: .whitespaces), let url = URLComponents(string: text),
          url.scheme == "https", let host = url.host, !host.isEmpty,
          url.user == nil, url.password == nil, url.query == nil, url.fragment == nil else { return nil }
    let h = host.lowercased()
    if h == "localhost" || h.hasSuffix(".localhost") || h == "::1" || h == "[::1]" || h.hasPrefix("127.") { return nil }
    guard text.lowercased().hasPrefix("https://") else { return nil }
    var path = url.percentEncodedPath
    while path.hasSuffix("/") { path.removeLast() }
    let port = url.port.map { $0 == 443 ? "" : ":\($0)" } ?? ""
    return "https://\(h)\(port)\(path)"
}

/// A relayed turn's target: the service's chat route, named by its host.
public func relayTurn(base: String, model: String, key: String) -> LocalTurn {
    let host = URLComponents(string: base).map { c in c.host.map { h in c.port.map { "\(h):\($0)" } ?? h } ?? base } ?? base
    return LocalTurn(endpoint: base, model: model, key: key, chatPath: "/chat/completions", label: host)
}

/// The local lane's machine side; injected so the handler can be tested without a server.
public protocol LocalServing: Sendable {
    /// The endpoints to ask, the named one first.
    func candidates(_ named: String?) -> [String]
    /// Ask every candidate at once and take the first, in order, that answers.
    func probe(_ candidates: [String], key: String?) async -> LocalHealth
    func complete(_ turn: LocalTurn, system: String, messages: [Message], maxTokens: Int?) async throws -> (text: String, model: String)
    func stream(_ turn: LocalTurn, system: String, messages: [Message], maxTokens: Int?) -> AsyncStream<StreamEvent>
    /// The relay's model list (ISC-580): GET <base>/models with the key, or the service's refusal.
    func models(base: String, key: String) async throws -> [String]
}

/// The real local lane, over URLSession. An ephemeral session, so no cookie,
/// cache or credential store holds anything a request carried.
public struct HTTPLocal: LocalServing {
    let session: URLSession
    let timeout: TimeInterval

    public init(session: URLSession = URLSession(configuration: .ephemeral), timeout: TimeInterval = localProbeTimeout) {
        self.session = session
        self.timeout = timeout
    }

    public func candidates(_ named: String?) -> [String] { localCandidates(named) }

    private func request(_ url: String, key: String?) -> URLRequest {
        var r = URLRequest(url: URL(string: url)!)
        r.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        if let key, !key.isEmpty { r.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization") }
        return r
    }

    func probeOne(_ endpoint: String, key: String?) async -> LocalHealth? {
        var r = request("\(endpoint)/v1/models", key: key)
        r.timeoutInterval = timeout
        let session = self.session
        let timeout = self.timeout
        // Raced against a timer as well, so a port whose holder accepts and never answers stays bounded.
        return await withTaskGroup(of: LocalHealth??.self) { group in
            group.addTask {
                guard let (data, res) = try? await session.data(for: r), let http = res as? HTTPURLResponse else { return .some(nil) }
                if http.statusCode == 401 || http.statusCode == 403 {
                    return .some(LocalHealth(reachable: true, endpoint: endpoint, models: [], needsKey: true))
                }
                guard (200..<300).contains(http.statusCode) else { return .some(nil) }
                return .some(LocalHealth(reachable: true, endpoint: endpoint, models: chatModelIds(modelIds(try? JSON.parse(data))), needsKey: false))
            }
            group.addTask {
                try? await Task.sleep(nanoseconds: UInt64((timeout + 0.05) * 1_000_000_000))
                // Silence past the bound: no answer, which is Optional's none, never LocalHealth.none.
                return Optional<LocalHealth?>.none
            }
            let first = await group.next() ?? Optional<LocalHealth?>.none
            group.cancelAll()
            return first ?? nil
        }
    }

    public func probe(_ candidates: [String], key: String?) async -> LocalHealth {
        let answers = await withTaskGroup(of: (Int, LocalHealth?).self) { group in
            for (i, c) in candidates.enumerated() { group.addTask { (i, await probeOne(c, key: key)) } }
            var all = [LocalHealth?](repeating: nil, count: candidates.count)
            for await (i, a) in group { all[i] = a }
            return all
        }
        return answers.compactMap { $0 }.first ?? .none
    }

    private func chatRequest(_ turn: LocalTurn, system: String, messages: [Message], stream: Bool, maxTokens: Int?) -> URLRequest {
        var r = request(turn.endpoint + turn.chatPath, key: turn.key)
        r.httpMethod = "POST"
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // A local model can take minutes on a long prompt; the reader stops it with Stop.
        r.timeoutInterval = 600
        r.httpBody = Data(chatRequestBody(system: system, messages: messages, model: turn.model, stream: stream, maxTokens: maxTokens).serialized.utf8)
        return r
    }

    public func complete(_ turn: LocalTurn, system: String, messages: [Message], maxTokens: Int?) async throws -> (text: String, model: String) {
        let (data, res) = try await session.data(for: chatRequest(turn, system: system, messages: messages, stream: false, maxTokens: maxTokens))
        let status = (res as? HTTPURLResponse)?.statusCode ?? 0
        switch reduceChatCompletion(try? JSON.parse(data), requested: turn.model) {
        case .reply(let text, let model): return (text, model)
        case .error(let e): throw LocalError(description: "\(turn.label) answered \(status): \(String(e.prefix(400)))")
        }
    }

    public func stream(_ turn: LocalTurn, system: String, messages: [Message], maxTokens: Int?) -> AsyncStream<StreamEvent> {
        let request = chatRequest(turn, system: system, messages: messages, stream: true, maxTokens: maxTokens)
        let session = self.session
        return AsyncStream { c in
            let task = Task {
                let reducer = OpenAIStreamReducer(requested: turn.model)
                do {
                    let (bytes, res) = try await session.bytes(for: request)
                    let status = (res as? HTTPURLResponse)?.statusCode ?? 0
                    if !(200..<300).contains(status) {
                        var body = Data()
                        for try await b in bytes { body.append(b) }
                        let why = serverError(try? JSON.parse(body)) ?? "no reply"
                        c.yield(.error("\(turn.label) answered \(status): \(String(why.prefix(400)))"))
                        c.finish()
                        return
                    }
                    for try await line in bytes.lines {
                        for e in reducer.line(line) { c.yield(e) }
                    }
                    for e in reducer.end() { c.yield(e) }
                } catch {
                    if !Task.isCancelled { c.yield(.error(error.localizedDescription)) }
                }
                c.finish()
            }
            // The reader closing the page stops the request with it.
            c.onTermination = { _ in task.cancel() }
        }
    }
}

extension HTTPLocal {
    public func models(base: String, key: String) async throws -> [String] {
        var r = request("\(base)/models", key: key)
        r.timeoutInterval = 15
        let (data, res) = try await session.data(for: r)
        let status = (res as? HTTPURLResponse)?.statusCode ?? 0
        let reply = try? JSON.parse(data)
        guard (200..<300).contains(status) else {
            let host = relayTurn(base: base, model: "", key: key).label
            throw LocalError(description: "\(host) answered \(status): \(String((serverError(reply) ?? "no reply").prefix(400)))")
        }
        return modelIds(reply)
    }
}

struct LocalError: Error, CustomStringConvertible { let description: String }
