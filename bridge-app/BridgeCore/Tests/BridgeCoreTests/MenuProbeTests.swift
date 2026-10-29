import XCTest
@testable import BridgeCore

/// The status menu asks the local ports once a minute, not on every
/// four-second refresh, so a keyed server is not sent a keyless request
/// fifteen times a minute.
final class MenuProbeTests: XCTestCase {
    let t0 = Date(timeIntervalSince1970: 1_000_000)

    func testFirstRefreshProbes() {
        XCTAssertTrue(localProbeDue(last: nil, now: t0))
    }

    func testTimerRefreshesWithinTheMinuteSkip() {
        for seconds in [4.0, 8, 32, 59.9] {
            XCTAssertFalse(localProbeDue(last: t0, now: t0.addingTimeInterval(seconds)), "\(seconds)s")
        }
    }

    func testTheMinuteBringsTheNextProbe() {
        XCTAssertTrue(localProbeDue(last: t0, now: t0.addingTimeInterval(localMenuProbeInterval)))
        XCTAssertTrue(localProbeDue(last: t0, now: t0.addingTimeInterval(600)))
    }

    func testForcedRefreshProbesAtOnce() {
        XCTAssertTrue(localProbeDue(last: t0, now: t0.addingTimeInterval(1), force: true))
    }

    func testFifteenTicksAMinuteBecomeOneProbe() {
        var last: Date?
        var probes = 0
        for tick in 0..<15 {
            let now = t0.addingTimeInterval(Double(tick) * 4)
            if localProbeDue(last: last, now: now) { probes += 1; last = now }
        }
        XCTAssertEqual(probes, 1)
    }
}
