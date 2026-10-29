import AppKit
import BridgeCore
import ServiceManagement
import SwiftUI

/// Abductive Bridge: the local CLI bridge as a menu-bar app, for Claude Code
/// and, since M56, Codex. The app serves the bridge on loopback port 8787 while
/// it runs; each credential stays with its CLI, and the app never reads or holds one.
@main
struct AbductiveBridgeApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    var body: some Scene {
        MenuBarExtra {
            BridgeMenu(model: BridgeModel.shared)
        } label: {
            MenuIcon(model: BridgeModel.shared)
        }
        .menuBarExtraStyle(.menu)
    }
}

struct MenuIcon: View {
    @ObservedObject var model: BridgeModel
    var body: some View {
        Image(systemName: model.ready
              ? "point.3.filled.connected.trianglepath.dotted"
              : "point.3.connected.trianglepath.dotted")
            .accessibilityLabel(T("Abductive Bridge"))
    }
}

struct BridgeMenu: View {
    @ObservedObject var model: BridgeModel

    var body: some View {
        Text(MenuCopy.status(model.status, port: model.port, lane: model.laneInUse))
        // M56, ISC-574: both lanes, one quiet line each, once the bridge has asked.
        if model.status == .running {
            Text(MenuCopy.laneLine("claude", model.claudeState)).foregroundStyle(.secondary)
            Text(MenuCopy.laneLine("codex", model.codexState)).foregroundStyle(.secondary)
            // M60, ISC-578: the local lane, what the probe of the usual ports found.
            Text(MenuCopy.localLine(model.localHealth)).foregroundStyle(.secondary)
        }
        Divider()
        ForEach(MenuCopy.items(model.status, claude: model.claudeState, codex: model.codexState), id: \.self) { item in
            switch item {
            case .openAbductive:
                Button(MenuCopy.label(item)) { model.openAbductive() }
            case .installClaude:
                Button(MenuCopy.label(item)) { NSWorkspace.shared.open(MenuCopy.installURL) }
            case .signIn:
                Button(MenuCopy.label(item)) { model.openSignIn() }
            case .installCodex:
                Button(MenuCopy.label(item)) { NSWorkspace.shared.open(MenuCopy.codexInstallURL) }
            case .signInCodex:
                Button(MenuCopy.label(item)) { model.openSignIn(codex: true) }
            case .startAtLogin:
                Divider()
                Toggle(MenuCopy.label(item), isOn: Binding(get: { model.startsAtLogin },
                                                          set: { model.setStartsAtLogin($0) }))
            case .quit:
                Divider()
                Button(MenuCopy.label(item)) { NSApp.terminate(nil) }
                    .keyboardShortcut("q")
            }
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    /// Take the get-URL Apple Event ourselves. A SwiftUI app whose only scene
    /// is a MenuBarExtra does not pass a URL sent to the running app on to
    /// `application(_:open:)`, so abductive-bridge://start did nothing once
    /// the app was already open (found in M57).
    func applicationWillFinishLaunching(_ notification: Notification) {
        NSAppleEventManager.shared().setEventHandler(
            self, andSelector: #selector(handleGetURL(_:withReplyEvent:)),
            forEventClass: AEEventClass(kInternetEventClass), andEventID: AEEventID(kAEGetURL))
    }

    @objc func handleGetURL(_ event: NSAppleEventDescriptor, withReplyEvent reply: NSAppleEventDescriptor) {
        guard let text = event.paramDescriptor(forKeyword: keyDirectObject)?.stringValue,
              let url = URL(string: text) else { return }
        application(NSApp, open: [url])
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        BridgeModel.shared.start()
    }

    /// abductive-bridge://start, from the page's button: take the port now if
    /// something else had it a moment ago, and open the status menu once so the
    /// reader sees the state line. A menu-bar app has no window to bring forward,
    /// and since macOS 14 it cannot take focus from the app that opened the URL.
    func application(_ application: NSApplication, open urls: [URL]) {
        let reason = LaunchReason(urls: urls)
        guard reason.opensMenu else { return }
        NSApp.activate()
        BridgeModel.shared.refreshNow(force: true)
        openStatusMenu(attempt: 0)
        // M57: then Abductive on the app's origin, once the menu has shown. The
        // open menu tracks events modally and holds back main-actor tasks until
        // it closes, so a timer in the common modes opens the page at once.
        if reason.opensSite {
            let timer = Timer(timeInterval: 1.5, repeats: false) { _ in
                MainActor.assumeIsolated { BridgeModel.shared.openAbductiveNow() }
            }
            RunLoop.main.add(timer, forMode: .common)
        }
    }

    /// The MenuBarExtra's button lives in a status-bar window; pressing it opens
    /// the menu. On a cold launch the item may not exist yet, so try a few times.
    private func openStatusMenu(attempt: Int) {
        DispatchQueue.main.asyncAfter(deadline: .now() + (attempt == 0 ? 0.6 : 0.4)) {
            let button = NSApp.windows
                .filter { String(describing: type(of: $0)).contains("NSStatusBarWindow") }
                .compactMap { $0.contentView.flatMap(Self.statusButton(in:)) }
                .first
            if let button { button.performClick(nil) } else if attempt < 5 { self.openStatusMenu(attempt: attempt + 1) }
        }
    }

    private static func statusButton(in view: NSView) -> NSStatusBarButton? {
        if let b = view as? NSStatusBarButton { return b }
        for sub in view.subviews { if let b = statusButton(in: sub) { return b } }
        return nil
    }

    func applicationWillTerminate(_ notification: Notification) {
        BridgeModel.shared.stop()
    }
}
