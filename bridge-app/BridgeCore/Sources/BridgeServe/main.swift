import BridgeCore
import Foundation

// `bridge-serve`: the app's bridge without the app, for the conformance script
// and for development. Port and extra origins come from the same environment
// variables the TS bridge reads. Exits 1 when the port is taken, like the TS
// bridge; otherwise runs until killed. Writes nothing to stdout or stderr.
//
// M57: with ABDUCTIVE_SITE_DIR set to a built site (dist/), it serves that site
// beside the bridge as the app does.
// M56: both lanes, Claude Code and Codex, as the app runs them.
// M60: and the local lane, an OpenAI-compatible server on this machine.
let provider = ClaudeProvider()
let locator = BinaryLocator(provider: provider)
let codex = CodexProvider()
let codexLocator = BinaryLocator(provider: codex)
let siteDir = ProcessInfo.processInfo.environment["ABDUCTIVE_SITE_DIR"].map { URL(fileURLWithPath: $0) }
let handler = BridgeHandler(probes: MachineProbes(provider: provider, locator: locator),
                            runner: MachineRunner(provider: provider, locator: locator),
                            codexProbes: MachineProbes(provider: codex, locator: codexLocator),
                            codexRunner: MachineRunner(provider: codex, locator: codexLocator),
                            appVersion: "app \(bridgeAppVersion)", extra: extraOrigins(),
                            site: siteDir.map { dir in SiteFiles(roots: { [dir] }) },
                            local: HTTPLocal(), port: bridgePort())
let server = BridgeServer(handler: handler)
do { try server.start(port: bridgePort()) } catch { exit(1) }
dispatchMain()
