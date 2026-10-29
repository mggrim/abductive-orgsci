import Foundation

// The menu's own reading of the local lane. The status menu refreshes every
// four seconds to take the bridge's port and notice Claude Code, and it used to
// ask all four local ports each time too, with no key. A server that wants one
// (oMLX on 8000) logged a 401 fifteen times a minute, all day. The local line
// changes when someone starts or stops a server, so once a minute is enough;
// the page's own turns probe with the reader's key and are not throttled.

/// How often the menu asks the local ports, unless a refresh is forced.
public let localMenuProbeInterval: TimeInterval = 60

/// Whether the menu's refresh should ask the local ports now: always on the
/// first refresh or a forced one, else once the interval has passed.
public func localProbeDue(last: Date?, now: Date, force: Bool = false) -> Bool {
    guard !force, let last else { return true }
    return now.timeIntervalSince(last) >= localMenuProbeInterval
}
