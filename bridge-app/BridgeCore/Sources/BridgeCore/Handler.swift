import Foundation

/// What the health reply needs from the machine; injected so tests need no `claude`.
public protocol HealthProbes: Sendable {
    /// `claude --version`, or nil when there is no `claude`.
    func claudeVersion() async -> String?
    /// Whether the CLI is signed in; nil when the probe could not tell.
    func signedIn() async -> Bool?
}

/// The two ways the bridge runs the CLI; injected for the same reason.
public protocol ClaudeRunning: Sendable {
    func complete(system: String, prompt: String, model: String) async throws -> (text: String, model: String)
    func stream(system: String, prompt: String, model: String) -> AsyncStream<StreamEvent>
}

public struct BridgeRequest: Sendable {
    public let method: String
    public let uri: String
    /// Lower-cased names.
    public let headers: [String: String]
    public let body: Data

    public init(method: String, uri: String, headers: [String: String], body: Data) {
        self.method = method
        self.uri = uri
        self.headers = Dictionary(headers.map { ($0.key.lowercased(), $0.value) }, uniquingKeysWith: { a, _ in a })
        self.body = body
    }

    public var path: String {
        String(uri.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false).first ?? "")
            .split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? ""
    }
}

public enum ResponseBody: Sendable {
    case bytes(Data)
    case stream(AsyncStream<Data>)
}

public struct BridgeResponse: Sendable {
    public var status: Int
    /// In the order they go on the wire.
    public var headers: [(String, String)]
    public var body: ResponseBody

    public func header(_ name: String) -> String? {
        headers.first { $0.0.lowercased() == name.lowercased() }?.1
    }

    static func json(_ value: JSON, status: Int = 200) -> BridgeResponse {
        BridgeResponse(status: status, headers: [("Content-Type", "application/json;charset=utf-8")],
                       body: .bytes(Data(value.serialized.utf8)))
    }

    static func text(_ s: String, status: Int) -> BridgeResponse {
        BridgeResponse(status: status, headers: [("content-type", "text/plain;charset=utf-8")], body: .bytes(Data(s.utf8)))
    }

    static func empty(_ status: Int, headers: [(String, String)] = []) -> BridgeResponse {
        BridgeResponse(status: status, headers: headers, body: .bytes(Data()))
    }
}

private let routes: Set<String> = ["/health", "/complete", "/stream", "/models"]
/// The dev server's proxy path for the bridge, which the app answers too (M57).
let cliBridgePrefix = "/cli-bridge"

/// The bridge's request handler: `createHandler` in the TS bridge.
public struct BridgeHandler: Sendable {
    let probes: HealthProbes
    let runner: ClaudeRunning
    /// M56: the Codex lane. A handler built without it reports Codex absent and refuses Codex turns.
    let codexProbes: HealthProbes?
    let codexRunner: ClaudeRunning?
    let appVersion: String
    let extra: [String]
    /// M57: the Abductive site, served on every GET or HEAD the bridge does not own.
    let site: SiteFiles?
    /// M56, ISC-574: told the lane each accepted turn names, so the menu can report
    /// the page's choice. Called with "claude", "codex" or "local", never with anything else.
    let onLane: (@Sendable (String) -> Void)?
    /// M60: the local lane. A handler built without it reports no local server and refuses local turns.
    let local: LocalServing?
    /// The port this bridge listens on, which a local endpoint may never name.
    let port: Int

    public init(probes: HealthProbes, runner: ClaudeRunning, codexProbes: HealthProbes? = nil,
                codexRunner: ClaudeRunning? = nil, appVersion: String, extra: [String] = [],
                site: SiteFiles? = nil, onLane: (@Sendable (String) -> Void)? = nil,
                local: LocalServing? = nil, port: Int = defaultBridgePort) {
        self.onLane = onLane
        self.local = local
        self.port = port
        self.probes = probes
        self.runner = runner
        self.codexProbes = codexProbes
        self.codexRunner = codexRunner
        self.appVersion = appVersion
        self.extra = extra
        self.site = site
    }

    public func handle(_ req: BridgeRequest) async -> BridgeResponse {
        let origin = req.headers["origin"]
        let decision = corsDecision(origin, extra: extra)
        // Refused before any work: a text/plain POST skips preflight, and the
        // page never reading the answer would not stop the CLI from running.
        if decision == .refuse {
            return .text("cli-bridge: this origin may not use the bridge", status: 403)
        }
        let cors: [(String, String)] =
            decision == .allow ? [("Access-Control-Allow-Origin", origin ?? ""), ("Vary", "Origin")] : []
        var path = req.path
        // M57: the page on the app's origin reaches the bridge the way the dev
        // server's proxy does, under /cli-bridge.
        if path.hasPrefix(cliBridgePrefix + "/") { path = String(path.dropFirst(cliBridgePrefix.count)) }

        if req.method == "OPTIONS" {
            if !routes.contains(path) { return .empty(404) }
            var headers = cors + [
                ("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
                ("Access-Control-Allow-Headers", "content-type"),
                ("Access-Control-Max-Age", "600"),
            ]
            // Chrome's private/local network access preflight wants a yes.
            if req.headers["access-control-request-private-network"] == "true"
                || req.headers["access-control-request-local-network"] == "true" {
                headers += [("access-control-allow-private-network", "true"), ("access-control-allow-local-network", "true")]
            }
            return .empty(204, headers: headers)
        }

        func respond(_ r: BridgeResponse) -> BridgeResponse {
            var r = r
            r.headers = r.headers.filter { h in !cors.contains { $0.0.lowercased() == h.0.lowercased() } } + cors
            return r
        }

        if path == "/health" {
            // POST /health may name a local endpoint and its key (M60); GET asks the usual ports.
            var named: String? = nil
            var key: String? = nil
            if req.method == "POST", let ask = (try? JSON.parse(req.body))?["local"] {
                if let e = ask["endpoint"] { named = loopbackEndpoint(e, ownPort: port) }
                key = ask["key"]?.stringValue.flatMap { $0.isEmpty ? nil : $0 }
            }
            var localHealth = LocalHealth.none
            if let local { localHealth = await local.probe(candidates(local, named), key: key) }
            let claude = await probes.claudeVersion()
            let signed: Bool? = claude == nil ? nil : await probes.signedIn()
            let codex = await codexProbes?.claudeVersion()
            let codexSigned: Bool? = codex == nil ? nil : await codexProbes?.signedIn()
            func lane(_ v: String?, _ s: Bool?) -> JSON {
                .object([("version", v.map(JSON.string) ?? .null), ("signedIn", s.map(JSON.bool) ?? .null)])
            }
            return respond(.json(.object([
                ("ok", .bool(true)),
                ("claude", claude.map(JSON.string) ?? .null),
                ("signedIn", signed.map(JSON.bool) ?? .null),
                ("bun", .string(appVersion)),
                ("providers", .object([
                    ("claude", lane(claude, signed)), ("codex", lane(codex, codexSigned)), ("local", localHealth.json),
                ])),
            ])))
        }
        if path == "/models" && req.method == "POST" {
            // The relay's model list (M60, ISC-580): an https root and a key, or nothing is sent.
            let json = try? JSON.parse(req.body)
            guard let local, let base = relayBase(json?["baseUrl"]), let key = json?["key"]?.stringValue, !key.isEmpty else {
                return respond(.json(.object([("error", .string("cli-bridge: /models needs an https baseUrl and a key"))]), status: 400))
            }
            do {
                let models = try await local.models(base: base, key: key)
                return respond(.json(.object([("models", .array(models.map(JSON.string)))])))
            } catch {
                return respond(.json(.object([("error", .string(String(describing: error)))]), status: 500))
            }
        }
        if (path == "/complete" || path == "/stream") && req.method == "POST" {
            let body: RequestBody
            do { body = try RequestBody(req.body) } catch {
                return respond(.json(.object([("error", .string(String(describing: error)))]), status: 500))
            }
            if body.provider == .string("local"), let local {
                return respond(await localTurn(body, local: local, streaming: path == "/stream"))
            }
            if body.provider == .string("relay"), let local {
                // Refused before anything is sent: an https root, a key and a model, or no call.
                guard let base = relayBase(body.baseUrl), let key = body.key?.stringValue, !key.isEmpty,
                      let model = body.model?.stringValue, !model.isEmpty else {
                    return respond(.json(.object([("error", .string(
                        "cli-bridge: a relayed turn needs an https baseUrl, a key and a model"))]), status: 400))
                }
                return respond(await chatTurn(relayTurn(base: base, model: model, key: key), body: body, local: local,
                                              streaming: path == "/stream"))
            }
            // The lane and its model, refused before anything runs (M56).
            let lane: ClaudeRunning
            let model: String
            let laneName: String
            switch body.provider {
            case nil, .string("claude")?:
                lane = runner
                laneName = "claude"
                model = body.model?.stringValue ?? "sonnet"
            case .string("codex")? where codexRunner != nil:
                guard let m = codexModel(body.model) else {
                    let named = body.model.map { $0.stringValue ?? $0.serialized } ?? "undefined"
                    return respond(.json(.object([("error", .string(
                        "cli-bridge: codex offers \(codexModels.joined(separator: ", ")), not \(named)"))]), status: 400))
                }
                lane = codexRunner!
                laneName = "codex"
                model = m
            default:
                return respond(.json(.object([("error", .string(#"cli-bridge: provider must be "claude", "codex", "local" or "relay""#))]), status: 400))
            }
            onLane?(laneName)
            if path == "/complete" {
                do {
                    let result = try await lane.complete(system: body.system, prompt: assembleCliPrompt(body.messages), model: model)
                    return respond(.json(.object([
                        ("text", .string(result.text)), ("model", .string(result.model)), ("modelVersion", .string(result.model)),
                    ])))
                } catch {
                    return respond(.json(.object([("error", .string(String(describing: error)))]), status: 500))
                }
            }
            let events = lane.stream(system: body.system, prompt: assembleCliPrompt(body.messages), model: model)
            let chunks = AsyncStream<Data> { c in
                let task = Task {
                    // Open the stream at once, so nothing between treats a slow first token as a dead connection.
                    c.yield(Data(": open\n\n".utf8))
                    for await e in events { c.yield(Data(sseFrame(e).utf8)) }
                    c.finish()
                }
                c.onTermination = { _ in task.cancel() }
            }
            return respond(BridgeResponse(status: 200, headers: [
                ("content-type", "text/event-stream"), ("cache-control", "no-cache"), ("connection", "keep-alive"),
            ], body: .stream(chunks)))
        }
        if let site, req.method == "GET" || req.method == "HEAD", !routes.contains(path) {
            return respond(site.response(path: path, head: req.method == "HEAD"))
        }
        return respond(.text("cli-bridge: POST /complete, POST /stream, or GET /health", status: 404))
    }
}

extension BridgeHandler {
    /// The candidates the lane gives, without any that is not loopback or is this bridge's own port.
    func candidates(_ local: LocalServing, _ named: String?) -> [String] {
        local.candidates(named).filter { loopbackEndpoint(.string($0), ownPort: port) != nil }
    }

    /// A local turn (M60): the endpoint checked before anything is sent, the
    /// server found by probing when the request names none, and the model the
    /// server's first when the request names none.
    func localTurn(_ body: RequestBody, local: LocalServing, streaming: Bool) async -> BridgeResponse {
        let named = body.endpoint.flatMap { loopbackEndpoint($0, ownPort: port) }
        if body.endpoint != nil && named == nil {
            return .json(.object([("error", .string(
                "cli-bridge: a local model server must be a port on this machine (127.0.0.1 or ::1), not the bridge's own"))]), status: 400)
        }
        let key = body.key?.stringValue.flatMap { $0.isEmpty ? nil : $0 }
        let requested = body.model?.stringValue.flatMap { $0.isEmpty ? nil : $0 }
        let turn: LocalTurn
        if let named, let requested {
            turn = LocalTurn(endpoint: named, model: requested, key: key)
        } else {
            let found = await local.probe(candidates(local, named), key: key)
            guard found.reachable, let endpoint = found.endpoint else {
                let ports = localPorts.map(String.init).joined(separator: ", ")
                let error = "no local model server answered on ports \(ports)\(named.map { " or at \($0)" } ?? "")"
                return .json(.object([("error", .string(error))]), status: 500)
            }
            guard let model = requested ?? found.models.first else {
                return .json(.object([("error", .string("\(localServerName(endpoint)) is running but has no models"))]), status: 500)
            }
            turn = LocalTurn(endpoint: endpoint, model: model, key: key)
        }
        onLane?("local")
        return await chatTurn(turn, body: body, local: local, streaming: streaming)
    }

    /// One chat turn, local or relayed, answered in the wire shapes the other lanes use.
    func chatTurn(_ turn: LocalTurn, body: RequestBody, local: LocalServing, streaming: Bool) async -> BridgeResponse {
        if !streaming {
            do {
                let r = try await local.complete(turn, system: body.system, messages: body.messages, maxTokens: body.maxTokens)
                return .json(.object([("text", .string(r.text)), ("model", .string(r.model)), ("modelVersion", .string(r.model))]))
            } catch {
                return .json(.object([("error", .string(String(describing: error)))]), status: 500)
            }
        }
        let events = local.stream(turn, system: body.system, messages: body.messages, maxTokens: body.maxTokens)
        let chunks = AsyncStream<Data> { c in
            let task = Task {
                c.yield(Data(": open\n\n".utf8))
                for await e in events { c.yield(Data(sseFrame(e).utf8)) }
                c.finish()
            }
            c.onTermination = { _ in task.cancel() }
        }
        return BridgeResponse(status: 200, headers: [
            ("content-type", "text/event-stream"), ("cache-control", "no-cache"), ("connection", "keep-alive"),
        ], body: .stream(chunks))
    }
}

/// `{system?, messages?, model?}` read the way the TS bridge reads it.
struct RequestBody {
    let system: String
    let messages: [Message]
    /// As sent; each lane reads it (the Claude lane falls back to "sonnet").
    let model: JSON?
    /// M56: "claude", "codex", or absent for claude; M60 adds "local".
    let provider: JSON?
    /// M60, the local lane: a named server, its key, and the reply's length cap.
    let endpoint: JSON?
    /// M60, the relay: the https API root.
    let baseUrl: JSON?
    let key: JSON?
    let maxTokens: Int?

    init(_ data: Data) throws {
        let json = try JSON.parse(data)
        system = json["system"]?.stringValue ?? ""
        model = json["model"]
        provider = json["provider"]
        endpoint = json["endpoint"]
        baseUrl = json["baseUrl"]
        key = json["key"]
        maxTokens = json["maxTokens"]?.numberValue.flatMap { $0 > 0 && $0 == $0.rounded() ? Int($0) : nil }
        if case .array(let items)? = json["messages"] {
            messages = items.map { m in
                Message(role: m["role"]?.stringValue ?? "", content: m["content"]?.stringValue ?? m["content"].map { $0.serialized } ?? "undefined")
            }
        } else {
            messages = []
        }
    }
}
