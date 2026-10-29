import Foundation

/// Every string the app shows goes through `T`, so the copy bar
/// (tests/copyBarScan.ts) reads exactly the strings a reader sees.
@inline(__always) public func T(_ s: String) -> String { s }

/// The bridge's state as the menu's one status line names it. Since M56 the
/// line is about the bridge and the lane in use; each lane's own state is one
/// quiet line under it.
public enum BridgeStatus: Equatable, Sendable {
    case starting, running, portTaken

    public static func from(listening: Bool) -> BridgeStatus { listening ? .running : .portTaken }
}

/// One lane's state, from its probes.
public enum LaneState: Equatable, Sendable {
    case notInstalled, signedOut, signedIn
    /// Installed, and the sign-in probe could not tell.
    case unknown

    public static func from(version: String?, signedIn: Bool?) -> LaneState {
        guard version != nil else { return .notInstalled }
        switch signedIn {
        case true?: return .signedIn
        case false?: return .signedOut
        case nil: return .unknown
        }
    }

    /// Whether a turn on this lane can run; an unknown sign-in is tried, as the page's card does.
    public var ready: Bool { self == .signedIn || self == .unknown }
}

public enum MenuItem: Equatable, Sendable {
    case openAbductive, installClaude, signIn, installCodex, signInCodex, startAtLogin, quit
}

public enum MenuCopy {
    /// M57: Abductive as the app serves it, on the bridge's own origin, where
    /// every browser (Safari too) reaches the bridge same-origin.
    public static func abductiveURL(port: Int) -> URL { URL(string: "http://localhost:\(port)/")! }
    public static let installURL = URL(string: "https://code.claude.com/docs/en/setup")!
    /// M56: Codex's own install page.
    public static let codexInstallURL = URL(string: "https://developers.openai.com/codex")!

    /// Each lane as the menu names it.
    public static func laneName(_ lane: String) -> String {
        switch lane {
        case "codex": return T("Codex")
        case "local": return T("Local model")
        default: return T("Claude Code")
        }
    }

    /// M60, ISC-578: the local lane's one quiet line, e.g. "Local model: Ollama on port 11434, 3 models".
    public static func localLine(_ h: LocalHealth) -> String {
        guard h.reachable, let endpoint = h.endpoint else { return T("Local model: not found") }
        let name = localServerName(endpoint)
        let port = endpoint.split(separator: ":").last.map(String.init) ?? ""
        let server = name.hasPrefix("port ") ? T("a server on port \(port)") : T("\(name) on port \(port)")
        if h.needsKey { return T("Local model: \(server), asks for a key") }
        switch h.models.count {
        case 0: return T("Local model: \(server), add a model")
        case 1: return T("Local model: \(server), 1 model")
        default: return T("Local model: \(server), \(h.models.count) models")
        }
    }

    /// The status line. `lane` is the lane the page's last turn named, nil before any turn:
    /// the lane in use is the page's choice, and the app only reports it.
    public static func status(_ s: BridgeStatus, port: Int, lane: String?) -> String {
        switch s {
        case .starting: return T("Starting the bridge on port \(port)…")
        case .running:
            guard let lane else { return T("Running on this Mac, port \(port)") }
            return T("Running on this Mac, port \(port), \(laneName(lane))")
        case .portTaken: return T("Port \(port) is taken by another program")
        }
    }

    /// One quiet line per lane, e.g. "Codex: not installed".
    public static func laneLine(_ lane: String, _ state: LaneState) -> String {
        let name = laneName(lane)
        switch state {
        case .signedIn: return T("\(name): signed in")
        case .signedOut: return T("\(name): not signed in")
        case .notInstalled: return T("\(name): not installed")
        case .unknown: return T("\(name): installed")
        }
    }

    /// The items under the lines, each only when it applies.
    public static func items(_ s: BridgeStatus, claude: LaneState, codex: LaneState) -> [MenuItem] {
        var items: [MenuItem] = [.openAbductive]
        if s == .running {
            if claude == .notInstalled { items.append(.installClaude) }
            if claude == .signedOut { items.append(.signIn) }
            if codex == .notInstalled { items.append(.installCodex) }
            if codex == .signedOut { items.append(.signInCodex) }
        }
        return items + [.startAtLogin, .quit]
    }

    public static func label(_ item: MenuItem) -> String {
        switch item {
        case .openAbductive: return T("Open Abductive")
        case .installClaude: return T("Install Claude Code…")
        case .signIn: return T("Sign in to Claude Code…")
        case .installCodex: return T("Install Codex…")
        case .signInCodex: return T("Sign in to Codex…")
        case .startAtLogin: return T("Start at login")
        case .quit: return T("Quit")
        }
    }
}

/// Why the app was launched or activated. Two verbs come from the page:
/// abductive-bridge://start (the card's "try the app" step in every browser)
/// takes the port and opens the status menu once, so the reader sees the state
/// line; abductive-bridge://open (the Safari card's control, M57) does the same
/// and then opens Abductive on the app's origin. An ordinary launch stays silent.
public enum LaunchReason: Equatable, Sendable {
    case ordinary, start, open

    public init(urls: [URL]) {
        let hosts = urls.filter { $0.scheme == "abductive-bridge" }.map(\.host)
        if hosts.contains("open") { self = .open } else if hosts.contains("start") { self = .start } else { self = .ordinary }
    }

    public var opensMenu: Bool { self != .ordinary }

    /// Only open: a Chrome or Firefox reader who fired start already has a page
    /// that reaches the bridge, and a second tab on another origin would split
    /// their studies across two addresses.
    public var opensSite: Bool { self == .open }
}
