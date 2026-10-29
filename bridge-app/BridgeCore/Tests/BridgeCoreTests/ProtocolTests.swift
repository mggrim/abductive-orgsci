import XCTest
@testable import BridgeCore

/// The same cases tests/m54-bridge-reach.test.ts holds the TS bridge to.
final class CorsTests: XCTestCase {
    let cases: [(String?, CorsDecision)] = [
        ("https://abductive.pages.dev", .allow),
        ("https://abc123.abductive.pages.dev", .allow),
        ("https://m54.abductive.pages.dev", .allow),
        ("http://localhost:5173", .allow),
        ("http://localhost:5194", .allow),
        ("http://127.0.0.1:5173", .allow),
        ("http://[::1]:5173", .allow),
        ("http://app.localhost:5173", .allow),
        ("http://localhost", .allow),
        ("http://abductive.pages.dev", .refuse),
        ("https://abductive.pages.dev.evil.com", .refuse),
        ("https://evilabductive.pages.dev", .refuse),
        ("https://other.pages.dev", .refuse),
        ("https://example.com", .refuse),
        ("http://192.168.1.20:5173", .refuse),
        ("http://localhost.evil.com", .refuse),
        ("null", .refuse),
        // Not an origin as a browser writes one: the URL parser would rewrite
        // each of these, and the TS bridge refuses anything it rewrites.
        ("HTTPS://abductive.pages.dev", .refuse),
        ("https://abductive.pages.dev/", .refuse),
        ("https://abductive.pages.dev:443", .refuse),
        ("http://localhost:80", .refuse),
        ("http://localhost:05173", .refuse),
        ("http://localhost:", .refuse),
        ("https://user@abductive.pages.dev", .refuse),
        ("https://a_b.abductive.pages.dev", .refuse),
        ("ftp://localhost", .refuse),
        (nil, .noOrigin),
    ]

    func testTable() {
        for (origin, want) in cases {
            XCTAssertEqual(corsDecision(origin), want, "\(origin ?? "(no Origin)")")
        }
    }

    func testExtraOriginExactly() {
        let extra = ["https://mac.tail28ec80.ts.net:8443"]
        XCTAssertEqual(corsDecision("https://mac.tail28ec80.ts.net:8443", extra: extra), .allow)
        XCTAssertEqual(corsDecision("https://mac.tail28ec80.ts.net", extra: extra), .refuse)
    }

    func testPortAndExtraFromEnvironment() {
        XCTAssertEqual(bridgePort([:]), 8787)
        XCTAssertEqual(bridgePort(["ABDUCTIVE_BRIDGE_PORT": "8797"]), 8797)
        XCTAssertEqual(bridgePort(["ABDUCTIVE_BRIDGE_PORT": "nonsense"]), 8787)
        XCTAssertEqual(bridgePort(["ABDUCTIVE_BRIDGE_PORT": "70000"]), 8787)
        XCTAssertEqual(extraOrigins(["ABDUCTIVE_BRIDGE_ORIGINS": " https://a.test , ,http://b.test"]),
                       ["https://a.test", "http://b.test"])
    }

    func testLoopbackOnly() {
        XCTAssertEqual(bridgeHostnames, ["127.0.0.1", "::1"])
    }
}

final class PromptTests: XCTestCase {
    func testAssemble() {
        let p = assembleCliPrompt([
            .init(role: "user", content: "one"),
            .init(role: "assistant", content: "two"),
        ])
        XCTAssertEqual(p, "one\n\n[Assistant's prior turn]\ntwo\n\n\nOutput ONLY the response content — no preamble.")
    }

    func testIsolationFlagsMatchTheTSBridge() {
        XCTAssertEqual(isolationFlags, ["--setting-sources", "", "--tools", "", "--strict-mcp-config",
                                        "--disable-slash-commands", "--no-chrome"])
        XCTAssertEqual(completeArguments(system: "S", model: "sonnet"),
                       ["-p", "--output-format", "json", "--model", "sonnet", "--system-prompt", "S"] + isolationFlags)
        XCTAssertEqual(completeArguments(system: "  ", model: "haiku"),
                       ["-p", "--output-format", "json", "--model", "haiku"] + isolationFlags)
        XCTAssertEqual(streamArguments(system: "S", model: "sonnet"),
                       ["-p", "--output-format", "stream-json", "--include-partial-messages", "--verbose",
                        "--model", "sonnet", "--system-prompt", "S"] + isolationFlags)
    }
}

final class ModelTests: XCTestCase {
    func parse(_ s: String) -> JSON { try! JSON.parse(s) }

    func testTopLevelModelWins() {
        XCTAssertEqual(resolveModel(parse(#"{"model":"m","modelUsage":{"x":{}}}"#), requested: "sonnet"), "m")
    }

    func testRequestedAliasMatches() {
        let j = parse(#"{"modelUsage":{"claude-haiku-4-5":{"outputTokens":900},"claude-sonnet-5":{"outputTokens":10}}}"#)
        XCTAssertEqual(resolveModel(j, requested: "sonnet"), "claude-sonnet-5")
    }

    func testMostOutputOtherwiseAndFirstOnTies() {
        let j = parse(#"{"modelUsage":{"a":{"outputTokens":5},"b":{"outputTokens":9},"c":{"outputTokens":9}}}"#)
        XCTAssertEqual(resolveModel(j, requested: "opus"), "b")
        XCTAssertEqual(resolveModel(parse(#"{"modelUsage":{}}"#), requested: "opus"), "opus")
        XCTAssertEqual(resolveModel(parse(#"{}"#), requested: "opus"), "opus")
    }

    func testStreamLines() {
        XCTAssertNil(parseStreamLine("   "))
        XCTAssertNil(parseStreamLine("{not json"))
        XCTAssertEqual(parseStreamLine(#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"text":"hi"}}}"#),
                       .delta("hi"))
        XCTAssertNil(parseStreamLine(#"{"type":"stream_event","event":{"type":"message_start"}}"#))
        XCTAssertEqual(parseStreamLine(#"{"type":"result","result":"done","modelUsage":{"claude-sonnet-5":{"outputTokens":3}}}"#),
                       .final(text: "done", model: "claude-sonnet-5"))
        XCTAssertEqual(parseStreamLine(#"{"type":"result"}"#), .final(text: "", model: "sonnet"))
        XCTAssertNil(parseStreamLine(#"{"type":"system"}"#))
    }
}

final class JSONTests: XCTestCase {
    func testRoundTripKeepsKeyOrderAndNulls() throws {
        let s = #"{"ok":true,"claude":null,"signedIn":false,"n":1.5,"a":[1,"x"],"z":{"b":1,"a":2}}"#
        XCTAssertEqual(try JSON.parse(s).serialized, s)
    }

    func testEscapesLikeJSONStringify() throws {
        let v = JSON.string("a\"b\\c\n\t/é\u{01}")
        XCTAssertEqual(v.serialized, #""a\"b\\c\n\t/é\u0001""#)
        XCTAssertEqual(try JSON.parse(#""é😀\/""#), .string("é😀/"))
        XCTAssertEqual(JSON.number(3).serialized, "3")
        XCTAssertEqual(JSON.number(-0.25).serialized, "-0.25")
    }

    func testRejectsNonsense() {
        XCTAssertThrowsError(try JSON.parse("{"))
        XCTAssertThrowsError(try JSON.parse("{} x"))
        XCTAssertThrowsError(try JSON.parse(""))
    }
}
