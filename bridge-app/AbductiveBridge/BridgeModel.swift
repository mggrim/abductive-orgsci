import AppKit
import BridgeCore
import Foundation
import ServiceManagement

/// The bridge server and what the menu says about it.
@MainActor
final class BridgeModel: ObservableObject {
    static let shared = BridgeModel()

    @Published private(set) var status: BridgeStatus = .starting
    /// M56, ISC-574: each lane's state, and the lane the page's last turn named.
    @Published private(set) var claudeState: LaneState = .unknown
    @Published private(set) var codexState: LaneState = .unknown
    @Published private(set) var laneInUse: String?
    /// M60, ISC-578: what the local lane's probe of the usual ports found.
    @Published private(set) var localHealth: LocalHealth = .none
    /// When the menu last asked the local ports; it asks once a minute (MenuProbe.swift).
    private var lastLocalProbe: Date?
    @Published private(set) var startsAtLogin = SMAppService.mainApp.status == .enabled

    let port = bridgePort()
    /// Two lanes (M56): Claude Code and Codex. The page picks the lane per request.
    private let provider = ClaudeProvider()
    private let locator: BinaryLocator
    private let probes: MachineProbes
    private let codex = CodexProvider()
    private let codexLocator: BinaryLocator
    private let codexProbes: MachineProbes
    private let server: BridgeServer
    /// M60: the local lane, an OpenAI-compatible server on this Mac, found by probing.
    private let localLane = HTTPLocal()
    private var timer: Timer?
    private var siteTimer: Timer?
    private var refreshing = false
    /// M57: a copy of the hosted site, kept under Caches and served on this port.
    let mirror = SiteMirror(cache: FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("com.matthewgrimes.AbductiveBridge/site"))

    private init() {
        locator = BinaryLocator(provider: provider)
        probes = MachineProbes(provider: provider, locator: locator)
        codexLocator = BinaryLocator(provider: codex)
        codexProbes = MachineProbes(provider: codex, locator: codexLocator)
        // The mirror when there is one, else the build bundled at release.
        let mirror = self.mirror
        let bundled = Bundle.main.resourceURL?.appendingPathComponent("site")
        let site = SiteFiles(roots: { [mirror.currentRoot(), bundled].compactMap { $0 } })
        // The lane in use is the page's choice: the app hears it from each turn.
        let onLane: @Sendable (String) -> Void = { lane in
            Task { @MainActor in BridgeModel.shared.noteLane(lane) }
        }
        server = BridgeServer(handler: BridgeHandler(
            probes: probes, runner: MachineRunner(provider: provider, locator: locator),
            codexProbes: codexProbes, codexRunner: MachineRunner(provider: codex, locator: codexLocator),
            appVersion: "app \(bridgeAppVersion)", extra: extraOrigins(), site: site, onLane: onLane,
            local: localLane, port: bridgePort()))
    }

    func start() {
        refreshNow()
        // The site: on launch, then every hour.
        Task { await mirror.refresh() }
        siteTimer = Timer.scheduledTimer(withTimeInterval: 3600, repeats: true) { _ in
            Task { await BridgeModel.shared.mirror.refresh() }
        }
        // Every few seconds: take the port once it is free, and notice Claude
        // Code being installed or signed in. A yes is cached, so a running
        // bridge costs nothing here. The local ports are asked once a minute.
        timer = Timer.scheduledTimer(withTimeInterval: 4, repeats: true) { _ in
            Task { @MainActor in BridgeModel.shared.refreshNow() }
        }
    }

    func stop() {
        timer?.invalidate()
        siteTimer?.invalidate()
        server.stop()
    }

    func refreshNow(force: Bool = false) {
        guard !refreshing else { return }
        refreshing = true
        Task {
            if !server.isListening { _ = try? server.start(port: port) }
            let listening = server.isListening
            if listening {
                let claude = await probes.claudeVersion()
                claudeState = .from(version: claude, signedIn: claude == nil ? nil : await probes.signedIn())
                let codex = await codexProbes.claudeVersion()
                codexState = .from(version: codex, signedIn: codex == nil ? nil : await codexProbes.signedIn())
                if localProbeDue(last: lastLocalProbe, now: Date(), force: force) {
                    lastLocalProbe = Date()
                    localHealth = await localLane.probe(localCandidates(nil), key: nil)
                }
            }
            status = .from(listening: listening)
            startsAtLogin = SMAppService.mainApp.status == .enabled
            refreshing = false
        }
    }

    /// M57, ISC-560: open Abductive on this app's origin in the default browser,
    /// after a refresh of the mirror that waits at most a few seconds, so the
    /// reader gets the hosted site's latest build when the network allows.
    func openAbductive() {
        let url = MenuCopy.abductiveURL(port: port)
        var opened = false
        func openOnce() {
            guard !opened else { return }
            opened = true
            NSWorkspace.shared.open(url)
        }
        // Both tasks run on the main actor; whichever ends first opens the page,
        // and a slow refresh carries on to finish in the background.
        Task { await mirror.refresh(); openOnce() }
        Task { try? await Task.sleep(for: .seconds(3)); openOnce() }
    }

    /// The same page without waiting for the mirror, for the scheme launch,
    /// which runs while the menu is open; the refresh carries on behind it.
    func openAbductiveNow() {
        NSWorkspace.shared.open(MenuCopy.abductiveURL(port: port))
        Task { await mirror.refresh() }
    }

    func noteLane(_ lane: String) {
        if laneInUse != lane { laneInUse = lane }
    }

    /// Whether the menu-bar icon shows the bridge ready: listening, and the lane
    /// in use (Claude Code before any turn) able to run.
    var ready: Bool {
        guard status == .running else { return false }
        switch laneInUse {
        case "codex": return codexState.ready
        case "local": return localHealth.ready
        default: return claudeState.ready
        }
    }

    /// Open Terminal running `claude`, or `codex login` for Codex, so the CLI's
    /// own sign-in appears. The app never sees the credential. A `.command` file
    /// opened in Terminal needs no Apple Events permission.
    func openSignIn(codex: Bool = false) {
        guard let exe = (codex ? codexLocator : locator).path(),
              let terminal = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Terminal") else { return }
        let quoted = "'" + exe.replacingOccurrences(of: "'", with: "'\\''") + "'"
        let script = FileManager.default.temporaryDirectory.appendingPathComponent("abductive-bridge-sign-in.command")
        do {
            try "#!/bin/zsh -l\nclear\nexec \(quoted)\(codex ? " login" : "")\n".write(to: script, atomically: true, encoding: .utf8)
            try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: script.path)
        } catch { return }
        NSWorkspace.shared.open([script], withApplicationAt: terminal, configuration: NSWorkspace.OpenConfiguration())
    }

    func setStartsAtLogin(_ on: Bool) {
        do {
            if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
        } catch {
            // Refused, most often because the reader must approve it in System Settings.
            if on { SMAppService.openSystemSettingsLoginItems() }
        }
        startsAtLogin = SMAppService.mainApp.status == .enabled
    }
}
