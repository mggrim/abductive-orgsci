import Foundation

/// A JSON value that keeps object keys in the order they were written.
///
/// The TS bridge reads the CLI's `modelUsage` with `Object.entries`, which is
/// insertion order, and picks the first match on a tie; Foundation's
/// JSONSerialization hands back an unordered dictionary. The serializer writes
/// what `JSON.stringify` writes: no escaped slashes, `null` kept, integers
/// without a decimal point.
public indirect enum JSON: Equatable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSON])
    case object([(String, JSON)])

    public static func == (a: JSON, b: JSON) -> Bool {
        switch (a, b) {
        case (.null, .null): return true
        case let (.bool(x), .bool(y)): return x == y
        case let (.number(x), .number(y)): return x == y
        case let (.string(x), .string(y)): return x == y
        case let (.array(x), .array(y)): return x == y
        case let (.object(x), .object(y)):
            return x.count == y.count && zip(x, y).allSatisfy { $0.0 == $1.0 && $0.1 == $1.1 }
        default: return false
        }
    }

    public subscript(key: String) -> JSON? {
        if case .object(let pairs) = self { return pairs.first { $0.0 == key }?.1 }
        return nil
    }

    public var stringValue: String? { if case .string(let s) = self { return s }; return nil }
    public var numberValue: Double? { if case .number(let n) = self { return n }; return nil }

    // MARK: serializing

    public var serialized: String {
        var out = ""
        write(into: &out)
        return out
    }

    private func write(into out: inout String) {
        switch self {
        case .null: out += "null"
        case .bool(let b): out += b ? "true" : "false"
        case .number(let n):
            if n.isFinite, n == n.rounded(), abs(n) < 1e15 { out += String(Int64(n)) }
            else if n.isFinite { out += String(n) }
            else { out += "null" }
        case .string(let s): JSON.quote(s, into: &out)
        case .array(let items):
            out += "["
            for (i, v) in items.enumerated() { if i > 0 { out += "," }; v.write(into: &out) }
            out += "]"
        case .object(let pairs):
            out += "{"
            for (i, (k, v)) in pairs.enumerated() {
                if i > 0 { out += "," }
                JSON.quote(k, into: &out); out += ":"; v.write(into: &out)
            }
            out += "}"
        }
    }

    private static func quote(_ s: String, into out: inout String) {
        out += "\""
        for u in s.unicodeScalars {
            switch u {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            case "\u{08}": out += "\\b"
            case "\u{0C}": out += "\\f"
            default:
                if u.value < 0x20 { out += String(format: "\\u%04x", u.value) }
                else { out.unicodeScalars.append(u) }
            }
        }
        out += "\""
    }

    // MARK: parsing

    public struct ParseError: Error, CustomStringConvertible {
        public let description: String
    }

    public static func parse(_ text: String) throws -> JSON {
        try parse(Data(text.utf8))
    }

    public static func parse(_ data: Data) throws -> JSON {
        var p = Parser(bytes: [UInt8](data))
        p.skipSpace()
        let v = try p.value()
        p.skipSpace()
        guard p.i == p.bytes.count else { throw ParseError(description: "Unexpected token after JSON at position \(p.i)") }
        return v
    }

    private struct Parser {
        let bytes: [UInt8]
        var i = 0

        mutating func skipSpace() {
            while i < bytes.count, [0x20, 0x09, 0x0A, 0x0D].contains(bytes[i]) { i += 1 }
        }

        func fail(_ what: String = "Unexpected token") -> ParseError {
            ParseError(description: i >= bytes.count ? "Unexpected end of JSON input" : "\(what) at position \(i)")
        }

        mutating func literal(_ word: String, _ v: JSON) throws -> JSON {
            let w = Array(word.utf8)
            guard i + w.count <= bytes.count, Array(bytes[i..<i + w.count]) == w else { throw fail() }
            i += w.count
            return v
        }

        mutating func value() throws -> JSON {
            guard i < bytes.count else { throw fail() }
            switch bytes[i] {
            case UInt8(ascii: "{"): return try object()
            case UInt8(ascii: "["): return try array()
            case UInt8(ascii: "\""): return .string(try string())
            case UInt8(ascii: "t"): return try literal("true", .bool(true))
            case UInt8(ascii: "f"): return try literal("false", .bool(false))
            case UInt8(ascii: "n"): return try literal("null", .null)
            default: return try number()
            }
        }

        mutating func object() throws -> JSON {
            i += 1
            var pairs: [(String, JSON)] = []
            skipSpace()
            if i < bytes.count, bytes[i] == UInt8(ascii: "}") { i += 1; return .object(pairs) }
            while true {
                skipSpace()
                guard i < bytes.count, bytes[i] == UInt8(ascii: "\"") else { throw fail() }
                let k = try string()
                skipSpace()
                guard i < bytes.count, bytes[i] == UInt8(ascii: ":") else { throw fail() }
                i += 1
                skipSpace()
                let v = try value()
                // A repeated key keeps its first place and takes the last value, as JSON.parse does.
                if let at = pairs.firstIndex(where: { $0.0 == k }) { pairs[at].1 = v } else { pairs.append((k, v)) }
                skipSpace()
                guard i < bytes.count else { throw fail() }
                if bytes[i] == UInt8(ascii: ",") { i += 1; continue }
                if bytes[i] == UInt8(ascii: "}") { i += 1; return .object(pairs) }
                throw fail()
            }
        }

        mutating func array() throws -> JSON {
            i += 1
            var items: [JSON] = []
            skipSpace()
            if i < bytes.count, bytes[i] == UInt8(ascii: "]") { i += 1; return .array(items) }
            while true {
                skipSpace()
                items.append(try value())
                skipSpace()
                guard i < bytes.count else { throw fail() }
                if bytes[i] == UInt8(ascii: ",") { i += 1; continue }
                if bytes[i] == UInt8(ascii: "]") { i += 1; return .array(items) }
                throw fail()
            }
        }

        mutating func hex4() throws -> UInt32 {
            guard i + 4 <= bytes.count, let s = String(bytes: bytes[i..<i + 4], encoding: .ascii),
                  let v = UInt32(s, radix: 16) else { throw fail("Bad Unicode escape") }
            i += 4
            return v
        }

        mutating func string() throws -> String {
            i += 1
            var scalars = String.UnicodeScalarView()
            var run: [UInt8] = []
            func flush() { if !run.isEmpty { scalars.append(contentsOf: String(decoding: run, as: UTF8.self).unicodeScalars); run.removeAll() } }
            while true {
                guard i < bytes.count else { throw fail("Unterminated string") }
                let b = bytes[i]
                if b == UInt8(ascii: "\"") { i += 1; flush(); return String(scalars) }
                if b < 0x20 { throw fail("Bad control character in string literal") }
                if b != UInt8(ascii: "\\") { run.append(b); i += 1; continue }
                flush()
                i += 1
                guard i < bytes.count else { throw fail() }
                let e = bytes[i]; i += 1
                switch e {
                case UInt8(ascii: "\""): scalars.append("\"")
                case UInt8(ascii: "\\"): scalars.append("\\")
                case UInt8(ascii: "/"): scalars.append("/")
                case UInt8(ascii: "b"): scalars.append("\u{08}")
                case UInt8(ascii: "f"): scalars.append("\u{0C}")
                case UInt8(ascii: "n"): scalars.append("\n")
                case UInt8(ascii: "r"): scalars.append("\r")
                case UInt8(ascii: "t"): scalars.append("\t")
                case UInt8(ascii: "u"):
                    var v = try hex4()
                    if (0xD800...0xDBFF).contains(v), i + 6 <= bytes.count,
                       bytes[i] == UInt8(ascii: "\\"), bytes[i + 1] == UInt8(ascii: "u") {
                        let save = i
                        i += 2
                        let lo = try hex4()
                        if (0xDC00...0xDFFF).contains(lo) { v = 0x10000 + ((v - 0xD800) << 10) + (lo - 0xDC00) } else { i = save }
                    }
                    // A lone surrogate cannot live in a Swift string; it becomes U+FFFD.
                    scalars.append(Unicode.Scalar(v) ?? "\u{FFFD}")
                default: throw fail("Bad escaped character")
                }
            }
        }

        mutating func number() throws -> JSON {
            let start = i
            if i < bytes.count, bytes[i] == UInt8(ascii: "-") { i += 1 }
            let digits = { (b: UInt8) in b >= 0x30 && b <= 0x39 }
            guard i < bytes.count, digits(bytes[i]) else { throw fail() }
            if bytes[i] == 0x30 { i += 1 } else { while i < bytes.count, digits(bytes[i]) { i += 1 } }
            if i < bytes.count, bytes[i] == UInt8(ascii: ".") {
                i += 1
                guard i < bytes.count, digits(bytes[i]) else { throw fail() }
                while i < bytes.count, digits(bytes[i]) { i += 1 }
            }
            if i < bytes.count, bytes[i] == UInt8(ascii: "e") || bytes[i] == UInt8(ascii: "E") {
                i += 1
                if i < bytes.count, bytes[i] == UInt8(ascii: "+") || bytes[i] == UInt8(ascii: "-") { i += 1 }
                guard i < bytes.count, digits(bytes[i]) else { throw fail() }
                while i < bytes.count, digits(bytes[i]) { i += 1 }
            }
            guard let n = Double(String(decoding: bytes[start..<i], as: UTF8.self)) else { throw fail() }
            return .number(n)
        }
    }
}
