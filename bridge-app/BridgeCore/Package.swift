// swift-tools-version:5.9
// The bridge's protocol and server, apart from the menu-bar app so both the
// app and `bridge-serve` (a command-line runner for the conformance script)
// link the same code. SwiftNIO is pinned to one release.
import PackageDescription

let package = Package(
    name: "BridgeCore",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "BridgeCore", targets: ["BridgeCore"]),
        .executable(name: "bridge-serve", targets: ["BridgeServe"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-nio.git", exact: "2.103.0"),
    ],
    targets: [
        .target(
            name: "BridgeCore",
            dependencies: [
                .product(name: "NIOCore", package: "swift-nio"),
                .product(name: "NIOPosix", package: "swift-nio"),
                .product(name: "NIOHTTP1", package: "swift-nio"),
            ]
        ),
        .executableTarget(name: "BridgeServe", dependencies: ["BridgeCore"]),
        // Fixtures/ holds real `codex exec --json` output, read by path (M56).
        .testTarget(name: "BridgeCoreTests", dependencies: ["BridgeCore"], exclude: ["Fixtures"]),
    ]
)
