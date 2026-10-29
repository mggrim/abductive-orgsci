import XCTest
@testable import BridgeCore

/// A launch through abductive-bridge://start opens the status menu once, so the
/// reader coming from the page sees the state line; any other launch stays silent.
final class LaunchTests: XCTestCase {
    func url(_ s: String) -> URL { URL(string: s)! }

    func testSchemeStartOpensTheMenu() {
        XCTAssertEqual(LaunchReason(urls: [url("abductive-bridge://start")]), .start)
        XCTAssertTrue(LaunchReason.start.opensMenu)
    }

    /// M57, ISC-560: abductive-bridge://open opens the menu and then Abductive on
    /// the app's origin, for the Safari card; start stays as M55 built it, so
    /// Chrome and Firefox, which fire start, get no second tab.
    func testOpenOpensTheMenuAndTheSiteStartOnlyTheMenu() {
        XCTAssertEqual(LaunchReason(urls: [url("abductive-bridge://open")]), .open)
        XCTAssertTrue(LaunchReason.open.opensMenu)
        XCTAssertTrue(LaunchReason.open.opensSite)
        XCTAssertFalse(LaunchReason.start.opensSite)
        XCTAssertFalse(LaunchReason.ordinary.opensSite)
    }

    func testEverythingElseStaysSilent() {
        XCTAssertEqual(LaunchReason(urls: []), .ordinary)
        XCTAssertEqual(LaunchReason(urls: [url("abductive-bridge://elsewhere")]), .ordinary)
        XCTAssertEqual(LaunchReason(urls: [url("https://abductive.pages.dev/start")]), .ordinary)
        XCTAssertFalse(LaunchReason.ordinary.opensMenu)
    }
}
