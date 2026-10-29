import XCTest
@testable import BridgeCore

/// M60, ISC-577 (the app's half). The local lane, held to the cases
/// tests/m60-local-bridge.test.ts holds the TS bridge to, and to the same real
/// Ollama output (Fixtures/openai-*).
final class LocalTests: XCTestCase {
    func fixture(_ name: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("Fixtures").appendingPathComponent(name)
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: where a server may be

    func testPortsAndNames() {
        XCTAssertEqual(localPorts, [11434, 1234, 8080, 8000])
        XCTAssertEqual(localServerName("http://127.0.0.1:11434"), "Ollama")
        XCTAssertEqual(localServerName("http://127.0.0.1:1234"), "LM Studio")
        XCTAssertEqual(localServerName("http://127.0.0.1:8080"), "llama.cpp")
        XCTAssertEqual(localServerName("http://127.0.0.1:8000"), "port 8000")
        XCTAssertEqual(localServerName("http://[::1]:9123"), "port 9123")
    }

    func testNamedEndpointCanonical() {
        XCTAssertEqual(loopbackEndpoint(.string("9000")), "http://127.0.0.1:9000")
        XCTAssertEqual(loopbackEndpoint(.number(9000)), "http://127.0.0.1:9000")
        XCTAssertEqual(loopbackEndpoint(.string("http://localhost:9000")), "http://127.0.0.1:9000")
        XCTAssertEqual(loopbackEndpoint(.string("http://127.0.0.1:9000/v1")), "http://127.0.0.1:9000")
        XCTAssertEqual(loopbackEndpoint(.string("http://127.0.0.1:9000/v1/")), "http://127.0.0.1:9000")
        XCTAssertEqual(loopbackEndpoint(.string("http://[::1]:9000")), "http://[::1]:9000")
        XCTAssertEqual(loopbackEndpoint(.string("localhost:9000")), "http://127.0.0.1:9000")
    }

    func testLoopbackOnly() {
        for bad in ["http://192.168.1.20:11434", "http://10.0.0.2:8000", "https://api.openai.com/v1",
                    "http://localhost.evil.com:9000", "http://127.0.0.1.nip.io:9000", "http://user:pw@127.0.0.1:9000",
                    "file:///etc/passwd", "ftp://127.0.0.1:21", "http://127.0.0.1:9000/other/path",
                    "http://127.0.0.1:9000/v1?x=1", "0", "70000", "", "not a url"] {
            XCTAssertNil(loopbackEndpoint(.string(bad)), bad)
        }
        XCTAssertNil(loopbackEndpoint(nil))
        XCTAssertNil(loopbackEndpoint(.null))
        XCTAssertNil(loopbackEndpoint(.object([])))
    }

    func testOwnPortRefused() {
        XCTAssertNil(loopbackEndpoint(.string("8787"), ownPort: 8787))
        XCTAssertNil(loopbackEndpoint(.string("http://localhost:8787"), ownPort: 8787))
        XCTAssertEqual(loopbackEndpoint(.string("8787"), ownPort: 8797), "http://127.0.0.1:8787")
    }

    func testCandidatesOrder() {
        XCTAssertEqual(localCandidates(nil), ["http://127.0.0.1:11434", "http://127.0.0.1:1234", "http://127.0.0.1:8080", "http://127.0.0.1:8000"])
        XCTAssertEqual(localCandidates("http://127.0.0.1:9000").first, "http://127.0.0.1:9000")
        XCTAssertEqual(localCandidates("http://127.0.0.1:1234"),
                       ["http://127.0.0.1:1234", "http://127.0.0.1:11434", "http://127.0.0.1:8080", "http://127.0.0.1:8000"])
    }

    // MARK: the wire, reduced (real Ollama fixtures)

    func testModelIds() throws {
        XCTAssertEqual(modelIds(try JSON.parse(fixture("openai-models-ollama.json"))), ["llama3.2:1b"])
        XCTAssertEqual(modelIds(try JSON.parse(#"{"object":"list","data":null}"#)), [])
        XCTAssertEqual(modelIds(try JSON.parse(#"{"data":[{"id":"a"},{"id":7},{"nope":1},{"id":"b"}]}"#)), ["a", "b"])
        XCTAssertEqual(modelIds(.string("garbage")), [])
    }

    func testChatModelIdsDropEmbedders() {
        XCTAssertEqual(chatModelIds(["qwen3.6-35b-a3b", "gemma-4-31b-it", "text-embedding-nomic-embed-text-v1.5", "gpt-oss-120b"]),
                       ["qwen3.6-35b-a3b", "gemma-4-31b-it", "gpt-oss-120b"])
    }

    func testRequestBody() {
        let body = chatRequestBody(system: "You are the tool.", messages: [
            Message(role: "user", content: "first"), Message(role: "assistant", content: "reply"), Message(role: "user", content: "second"),
        ], model: "llama3.2:1b", stream: true, maxTokens: 800)
        XCTAssertEqual(body.serialized, #"{"model":"llama3.2:1b","stream":true,"max_tokens":800,"messages":[{"role":"system","content":"You are the tool."},{"role":"user","content":"first"},{"role":"assistant","content":"reply"},{"role":"user","content":"second"}]}"#)
        XCTAssertEqual(chatRequestBody(system: "  ", messages: [Message(role: "user", content: "x")], model: "m", stream: false).serialized,
                       #"{"model":"m","stream":false,"messages":[{"role":"user","content":"x"}]}"#)
    }

    func testWholeReply() throws {
        XCTAssertEqual(reduceChatCompletion(try JSON.parse(fixture("openai-complete-ollama.json")), requested: "llama3.2:1b"),
                       .reply(text: "Yes.", model: "llama3.2:1b"))
        XCTAssertEqual(reduceChatCompletion(try JSON.parse(#"{"error":{"message":"model 'nope' not found","type":"not_found_error"}}"#), requested: "nope"),
                       .error("model 'nope' not found"))
        XCTAssertEqual(reduceChatCompletion(try JSON.parse(#"{"choices":[]}"#), requested: "m"), .error("the server gave no reply"))
    }

    func testStream() throws {
        let reducer = OpenAIStreamReducer(requested: "llama3.2:1b")
        let events = try fixture("openai-stream-ollama.txt").split(separator: "\n", omittingEmptySubsequences: false)
            .flatMap { reducer.line(String($0)) }
        var deltas: [String] = []
        for e in events { if case .delta(let t) = e { deltas.append(t) } else { XCTFail("only deltas before the end") } }
        XCTAssertGreaterThan(deltas.count, 3)
        XCTAssertEqual(reducer.end(), [.final(text: deltas.joined(), model: "llama3.2:1b")])
        XCTAssertTrue(deltas.joined().contains("Hello"))
    }

    func testStreamErrorOnce() {
        let reducer = OpenAIStreamReducer(requested: "m")
        XCTAssertEqual(reducer.line(#"data: {"error":{"message":"out of memory"}}"#), [.error("out of memory")])
        XCTAssertEqual(reducer.line(#"data: {"error":{"message":"again"}}"#), [])
        XCTAssertTrue(reducer.failed)
        XCTAssertEqual(reducer.end(), [])
    }

    func testStreamNoise() {
        let reducer = OpenAIStreamReducer(requested: "m")
        XCTAssertEqual(reducer.line("data: [DONE]"), [])
        XCTAssertEqual(reducer.line(": keep-alive"), [])
        XCTAssertEqual(reducer.line(""), [])
        XCTAssertEqual(reducer.end(), [])
    }

    // MARK: the handler

    final class FakeLocal: LocalServing, @unchecked Sendable {
        var health = LocalHealth(reachable: true, endpoint: "http://127.0.0.1:11434", models: ["llama3.2:1b"], needsKey: false)
        var probed: [([String], String?)] = []
        var turns: [LocalTurn] = []
        var systems: [String] = []
        var threads: [[Message]] = []
        func candidates(_ named: String?) -> [String] { localCandidates(named) }
        func probe(_ candidates: [String], key: String?) async -> LocalHealth { probed.append((candidates, key)); return health }
        func complete(_ turn: LocalTurn, system: String, messages: [Message], maxTokens: Int?) async throws -> (text: String, model: String) {
            turns.append(turn); systems.append(system); threads.append(messages)
            return ("The loop is visible now.", turn.model)
        }
        var listed: [(String, String)] = []
        func models(base: String, key: String) async throws -> [String] {
            listed.append((base, key))
            if key != "relay-key-123" { throw LocalError(description: "api.example.com answered 401: Incorrect API key provided") }
            return ["mistral-large", "mixtral"]
        }
        func stream(_ turn: LocalTurn, system: String, messages: [Message], maxTokens: Int?) -> AsyncStream<StreamEvent> {
            turns.append(turn)
            return AsyncStream { c in
                c.yield(.delta("The loop")); c.yield(.delta(" is visible now."))
                c.yield(.final(text: "The loop is visible now.", model: turn.model)); c.finish()
            }
        }
    }

    func handler(_ local: FakeLocal, lanes: LaneLog? = nil) -> BridgeHandler {
        BridgeHandler(probes: FakeProbes(version: "2.1.283 (Claude Code)", signed: true), runner: FakeRunner(),
                      appVersion: "app 1.3.0", onLane: lanes.map { log in { log.add($0) } }, local: local, port: 8787)
    }

    final class LaneLog: @unchecked Sendable {
        var lanes: [String] = []
        func add(_ l: String) { lanes.append(l) }
    }

    func post(_ h: BridgeHandler, _ path: String, _ body: String) async -> BridgeResponse {
        await h.handle(BridgeRequest(method: "POST", uri: path,
                                     headers: ["origin": "https://abductive.pages.dev", "content-type": "application/json"], body: Data(body.utf8)))
    }

    func text(_ r: BridgeResponse) async -> String {
        switch r.body {
        case .bytes(let d): return String(decoding: d, as: UTF8.self)
        case .stream(let s):
            var all = Data()
            for await d in s { all.append(d) }
            return String(decoding: all, as: UTF8.self)
        }
    }

    func testHealthReportsLocal() async {
        let r = await handler(FakeLocal()).handle(BridgeRequest(method: "GET", uri: "/health", headers: [:], body: Data()))
        let body = await text(r)
        XCTAssertTrue(body.hasSuffix(#""local":{"reachable":true,"endpoint":"http://127.0.0.1:11434","models":["llama3.2:1b"],"needsKey":false}}}"#), body)
    }

    func testHealthPostNamesEndpointAndKey() async {
        let local = FakeLocal()
        _ = await post(handler(local), "/health", #"{"local":{"endpoint":"9000","key":"k-123"}}"#)
        XCTAssertEqual(local.probed.last?.0.first, "http://127.0.0.1:9000")
        XCTAssertEqual(local.probed.last?.1, "k-123")
        // A named endpoint off the machine is not asked.
        _ = await post(handler(local), "/health", #"{"local":{"endpoint":"http://192.168.1.20:11434"}}"#)
        XCTAssertEqual(local.probed.last?.0, localCandidates(nil))
    }

    func testCompleteRunsTheTurn() async {
        let local = FakeLocal()
        let lanes = LaneLog()
        let r = await post(handler(local, lanes: lanes), "/complete",
                           #"{"provider":"local","model":"llama3.2:1b","system":"You are the tool.","messages":[{"role":"user","content":"What is the loop?"}]}"#)
        XCTAssertEqual(r.status, 200)
        let body = await text(r)
        XCTAssertEqual(body, #"{"text":"The loop is visible now.","model":"llama3.2:1b","modelVersion":"llama3.2:1b"}"#)
        XCTAssertEqual(local.turns.last, LocalTurn(endpoint: "http://127.0.0.1:11434", model: "llama3.2:1b", key: nil))
        XCTAssertEqual(local.systems.last, "You are the tool.")
        XCTAssertEqual(local.threads.last?.map(\.content), ["What is the loop?"])
        XCTAssertEqual(lanes.lanes, ["local"])
    }

    func testStreamAnswersSSE() async {
        let r = await post(handler(FakeLocal()), "/stream", #"{"provider":"local","messages":[{"role":"user","content":"Go."}]}"#)
        XCTAssertEqual(r.header("content-type"), "text/event-stream")
        let body = await text(r)
        XCTAssertTrue(body.hasPrefix(": open\n\n"))
        XCTAssertTrue(body.contains("event: delta"))
        XCTAssertTrue(body.contains(#"event: final"# + "\n" + #"data: {"text":"The loop is visible now.","model":"llama3.2:1b"}"#))
    }

    func testNamedEndpointAndKeyRelayed() async {
        let local = FakeLocal()
        _ = await post(handler(local), "/complete", #"{"provider":"local","endpoint":"http://localhost:9000","key":"k-123","model":"gemma","messages":[]}"#)
        XCTAssertEqual(local.turns.last, LocalTurn(endpoint: "http://127.0.0.1:9000", model: "gemma", key: "k-123"))
        XCTAssertTrue(local.probed.isEmpty, "an endpoint and a model named need no probe")
    }

    func testNoModelNamedTakesTheFirst() async {
        let local = FakeLocal()
        _ = await post(handler(local), "/complete", #"{"provider":"local","messages":[]}"#)
        XCTAssertEqual(local.turns.last?.model, "llama3.2:1b")
    }

    func testOffMachineRefusedBeforeWork() async {
        let local = FakeLocal()
        for endpoint in ["http://192.168.1.20:11434", "https://api.openai.com/v1", "8787"] {
            let r = await post(handler(local), "/complete", #"{"provider":"local","endpoint":"\#(endpoint)","messages":[]}"#)
            XCTAssertEqual(r.status, 400)
            let body = await text(r)
            XCTAssertTrue(body.hasPrefix(#"{"error":"#))
        }
        XCTAssertTrue(local.turns.isEmpty)
        XCTAssertTrue(local.probed.isEmpty)
    }

    func testNoServerAnswering() async {
        let local = FakeLocal()
        local.health = .none
        let r = await post(handler(local), "/complete", #"{"provider":"local","messages":[]}"#)
        XCTAssertEqual(r.status, 500)
        let body = await text(r)
        XCTAssertTrue(body.contains("no local model server"))
    }

    func testWithoutTheLaneLocalIsRefused() async {
        let h = BridgeHandler(probes: FakeProbes(version: nil, signed: nil), runner: FakeRunner(), appVersion: "app 1.3.0")
        let r = await post(h, "/complete", #"{"provider":"local","messages":[]}"#)
        XCTAssertEqual(r.status, 400)
    }

    // MARK: the relay (ISC-580)

    func testRelayBase() {
        XCTAssertEqual(relayBase(.string("https://api.together.xyz/v1")), "https://api.together.xyz/v1")
        XCTAssertEqual(relayBase(.string("https://api.together.xyz/v1/")), "https://api.together.xyz/v1")
        XCTAssertEqual(relayBase(.string("https://llm.example.org")), "https://llm.example.org")
        XCTAssertEqual(relayBase(.string(" https://llm.example.org:8443/openai/v1 ")), "https://llm.example.org:8443/openai/v1")
        for bad in ["http://api.example.com/v1", "https://user:pw@api.example.com/v1", "https://api.example.com/v1?key=1",
                    "https://api.example.com/v1#x", "https://localhost/v1", "https://127.0.0.1:8000/v1", "https://[::1]/v1",
                    "ftp://api.example.com", "api.example.com", ""] {
            XCTAssertNil(relayBase(.string(bad)), bad)
        }
        XCTAssertNil(relayBase(nil))
        XCTAssertNil(relayBase(.number(7)))
    }

    func testRelayModels() async {
        let local = FakeLocal()
        let ok = await post(handler(local), "/models", #"{"baseUrl":"https://api.example.com/v1","key":"relay-key-123"}"#)
        XCTAssertEqual(ok.status, 200)
        let okBody = await text(ok)
        XCTAssertEqual(okBody, #"{"models":["mistral-large","mixtral"]}"#)
        XCTAssertEqual(ok.header("access-control-allow-origin"), "https://abductive.pages.dev")
        let refused = await post(handler(local), "/models", #"{"baseUrl":"https://api.example.com/v1","key":"wrong"}"#)
        XCTAssertEqual(refused.status, 500)
        let bad = await post(handler(local), "/models", #"{"baseUrl":"http://api.example.com/v1","key":"k"}"#)
        XCTAssertEqual(bad.status, 400)
        XCTAssertEqual(local.listed.count, 2)
    }

    func testRelayTurn() async {
        let local = FakeLocal()
        let r = await post(handler(local), "/complete",
                           #"{"provider":"relay","baseUrl":"https://api.example.com/v1","key":"relay-key-123","model":"mistral-large","messages":[{"role":"user","content":"q"}]}"#)
        XCTAssertEqual(r.status, 200)
        XCTAssertEqual(local.turns.last, LocalTurn(endpoint: "https://api.example.com/v1", model: "mistral-large", key: "relay-key-123",
                                                   chatPath: "/chat/completions", label: "api.example.com"))
    }

    func testRelayRefusedBeforeWork() async {
        let local = FakeLocal()
        for body in [#"{"provider":"relay","baseUrl":"http://api.example.com/v1","key":"k","model":"m","messages":[]}"#,
                     #"{"provider":"relay","baseUrl":"https://localhost/v1","key":"k","model":"m","messages":[]}"#,
                     #"{"provider":"relay","baseUrl":"https://api.example.com/v1","model":"m","messages":[]}"#,
                     #"{"provider":"relay","baseUrl":"https://api.example.com/v1","key":"k","messages":[]}"#] {
            let r = await post(handler(local), "/complete", body)
            XCTAssertEqual(r.status, 400, body)
        }
        XCTAssertTrue(local.turns.isEmpty)
    }

    func testRelayPreflightAndStranger() async {
        let h = handler(FakeLocal())
        let pre = await h.handle(BridgeRequest(method: "OPTIONS", uri: "/models", headers: ["origin": "https://abductive.pages.dev"], body: Data()))
        XCTAssertEqual(pre.status, 204)
        let stranger = await h.handle(BridgeRequest(method: "POST", uri: "/models", headers: ["origin": "https://example.com"],
                                                    body: Data(#"{"baseUrl":"https://api.example.com/v1","key":"relay-key-123"}"#.utf8)))
        XCTAssertEqual(stranger.status, 403)
    }

    func testHTTPLocalRelayModels() async throws {
        StubProtocol.reset()
        StubProtocol.routes["https://api.example.com/v1/models"] = (200, #"{"data":[{"id":"mistral-large"}]}"#)
        let lane = HTTPLocal(session: stubbedSession())
        let models = try await lane.models(base: "https://api.example.com/v1", key: "relay-key-123")
        XCTAssertEqual(models, ["mistral-large"])
        XCTAssertEqual(StubProtocol.seen.last?.auth, "Bearer relay-key-123")
    }

    // MARK: the menu (ISC-578)

    func testMenuLocalLine() {
        let ollama = LocalHealth(reachable: true, endpoint: "http://127.0.0.1:11434", models: ["a", "b", "c"], needsKey: false)
        XCTAssertEqual(MenuCopy.localLine(ollama), "Local model: Ollama on port 11434, 3 models")
        XCTAssertEqual(MenuCopy.localLine(LocalHealth(reachable: true, endpoint: "http://127.0.0.1:1234", models: ["a"], needsKey: false)),
                       "Local model: LM Studio on port 1234, 1 model")
        XCTAssertEqual(MenuCopy.localLine(LocalHealth(reachable: true, endpoint: "http://127.0.0.1:11434", models: [], needsKey: false)),
                       "Local model: Ollama on port 11434, add a model")
        XCTAssertEqual(MenuCopy.localLine(LocalHealth(reachable: true, endpoint: "http://127.0.0.1:8000", models: [], needsKey: true)),
                       "Local model: a server on port 8000, asks for a key")
        XCTAssertEqual(MenuCopy.localLine(.none), "Local model: not found")
    }

    func testMenuStatusNamesTheLocalLane() {
        XCTAssertEqual(MenuCopy.laneName("local"), "Local model")
        XCTAssertEqual(MenuCopy.status(.running, port: 8787, lane: "local"), "Running on this Mac, port 8787, Local model")
    }

    func testLocalReady() {
        XCTAssertTrue(LocalHealth(reachable: true, endpoint: "http://127.0.0.1:11434", models: ["a"], needsKey: false).ready)
        XCTAssertFalse(LocalHealth(reachable: true, endpoint: "http://127.0.0.1:11434", models: [], needsKey: false).ready)
        XCTAssertFalse(LocalHealth(reachable: true, endpoint: "http://127.0.0.1:8000", models: [], needsKey: true).ready)
        XCTAssertFalse(LocalHealth.none.ready)
    }

    // MARK: HTTPLocal over a stubbed URL protocol

    func stubbedSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        return URLSession(configuration: config)
    }

    func testHTTPLocalProbeAndKey() async {
        StubProtocol.reset()
        StubProtocol.routes["http://127.0.0.1:1234/v1/models"] = (200, #"{"data":[{"id":"qwen"}]}"#)
        StubProtocol.routes["http://127.0.0.1:8000/v1/models"] = (401, #"{"error":"key"}"#)
        let lane = HTTPLocal(session: stubbedSession(), timeout: 0.5)
        let found = await lane.probe(localCandidates(nil), key: nil)
        XCTAssertEqual(found, LocalHealth(reachable: true, endpoint: "http://127.0.0.1:1234", models: ["qwen"], needsKey: false))
        let keyed = await lane.probe(["http://127.0.0.1:8000"], key: "k-9")
        XCTAssertEqual(keyed, LocalHealth(reachable: true, endpoint: "http://127.0.0.1:8000", models: [], needsKey: true))
        XCTAssertEqual(StubProtocol.seen.last { $0.url == "http://127.0.0.1:8000/v1/models" }?.auth, "Bearer k-9")
        let silent = await lane.probe(["http://127.0.0.1:9"], key: nil)
        XCTAssertEqual(silent, .none)
    }

    func testSilentPortDoesNotHideTheNextServer() async {
        StubProtocol.reset()
        StubProtocol.routes["http://127.0.0.1:11434/v1/models"] = (-1, "")
        StubProtocol.routes["http://127.0.0.1:1234/v1/models"] = (200, #"{"data":[{"id":"qwen3.6-35b-a3b"}]}"#)
        let found = await HTTPLocal(session: stubbedSession(), timeout: 0.3).probe(localCandidates(nil), key: nil)
        XCTAssertEqual(found, LocalHealth(reachable: true, endpoint: "http://127.0.0.1:1234", models: ["qwen3.6-35b-a3b"], needsKey: false))
    }

    func testHTTPLocalComplete() async throws {
        StubProtocol.reset()
        StubProtocol.routes["http://127.0.0.1:11434/v1/chat/completions"] = (200, try fixture("openai-complete-ollama.json"))
        let lane = HTTPLocal(session: stubbedSession())
        let r = try await lane.complete(LocalTurn(endpoint: "http://127.0.0.1:11434", model: "llama3.2:1b", key: nil),
                                        system: "One word.", messages: [Message(role: "user", content: "ready?")], maxTokens: nil)
        XCTAssertEqual(r.text, "Yes.")
        XCTAssertEqual(r.model, "llama3.2:1b")
        let sent = try XCTUnwrap(StubProtocol.seen.last?.body)
        XCTAssertEqual(try JSON.parse(sent)["stream"], .bool(false))
        XCTAssertNil(StubProtocol.seen.last?.auth)
    }

    func testHTTPLocalStream() async throws {
        StubProtocol.reset()
        StubProtocol.routes["http://127.0.0.1:11434/v1/chat/completions"] = (200, try fixture("openai-stream-ollama.txt"))
        let lane = HTTPLocal(session: stubbedSession())
        var events: [StreamEvent] = []
        for await e in lane.stream(LocalTurn(endpoint: "http://127.0.0.1:11434", model: "llama3.2:1b", key: "k"),
                                   system: "", messages: [Message(role: "user", content: "hi")], maxTokens: nil) {
            events.append(e)
        }
        guard case .final(let text, let model)? = events.last else { return XCTFail("no final: \(events)") }
        XCTAssertEqual(model, "llama3.2:1b")
        XCTAssertTrue(text.contains("Hello"))
        XCTAssertEqual(StubProtocol.seen.last?.auth, "Bearer k")
    }

    func testTheLaneWritesNothing() throws {
        let source = try String(contentsOf: URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/BridgeCore/Local.swift"), encoding: .utf8)
        // The logging calls are spelled in pieces, so this list does not trip the app's own no-logging scan.
        for banned in ["write(to", "createFile", "FileManager", "UserDefaults", "pri" + "nt(", "NS" + "Log", "os" + "_log", "Log" + "ger("] {
            XCTAssertFalse(source.contains(banned), banned)
        }
    }
}

/// A URL protocol that answers from a table and records what it was sent.
final class StubProtocol: URLProtocol, @unchecked Sendable {
    struct Seen { let url: String; let auth: String?; let body: Data? }
    nonisolated(unsafe) static var routes: [String: (Int, String)] = [:]
    nonisolated(unsafe) static var seen: [Seen] = []
    static let lock = NSLock()
    static func reset() { lock.withLock { routes = [:]; seen = [] } }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let url = request.url!.absoluteString
        var body = request.httpBody
        if body == nil, let stream = request.httpBodyStream {
            stream.open()
            var data = Data()
            let buf = UnsafeMutablePointer<UInt8>.allocate(capacity: 4096)
            while stream.hasBytesAvailable { let n = stream.read(buf, maxLength: 4096); if n <= 0 { break }; data.append(buf, count: n) }
            buf.deallocate()
            stream.close()
            body = data
        }
        let route = StubProtocol.lock.withLock { () -> (Int, String)? in
            StubProtocol.seen.append(Seen(url: url, auth: request.value(forHTTPHeaderField: "Authorization"), body: body))
            return StubProtocol.routes[url]
        }
        if route?.0 == -1 { return } // a port that accepts and never answers
        guard let (status, text) = route else {
            client?.urlProtocol(self, didFailWithError: URLError(.cannotConnectToHost))
            return
        }
        let res = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: [:])!
        client?.urlProtocol(self, didReceive: res, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(text.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
