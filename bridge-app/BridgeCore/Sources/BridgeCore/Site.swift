import CryptoKit
import Foundation

// M57, ISC-559. The app serves the Abductive site on the bridge's own origin,
// http://localhost:8787/, so the page and the bridge are one origin in every
// browser: no CORS, no mixed content, no private-network prompt. Safari blocks
// an http loopback request from the https site as mixed content, so this is the
// only route that works there.
//
// Two sources, first found wins per file: a mirror of the hosted site kept under
// the app's Caches folder, and the build bundled in the app at release. The
// build writes `site-files.json`, every file with its SHA-256; the mirror
// fetches that list and each file on it, and the bundle is checked against it.

/// The list of files the build writes beside index.html.
public let siteManifestName = "site-files.json"

/// Where the mirror comes from.
public let hostedSite = URL(string: "https://abductive.pages.dev")!

public struct SiteManifestEntry: Equatable, Sendable {
    public let path: String
    public let sha256: String
}

/// Parse `site-files.json`, refusing any path that could leave the site.
public func parseSiteManifest(_ data: Data) throws -> [SiteManifestEntry] {
    struct Bad: Error {}
    guard case .array(let items)? = try JSON.parse(data)["files"] else { throw Bad() }
    let entries = try items.map { item -> SiteManifestEntry in
        guard let path = item["path"]?.stringValue, let sha = item["sha256"]?.stringValue,
              safeRelativePath(path) == path else { throw Bad() }
        return SiteManifestEntry(path: path, sha256: sha.lowercased())
    }
    guard entries.contains(where: { $0.path == "index.html" }) else { throw Bad() }
    return entries
}

/// A path relative to the site's root with no way out of it, or nil.
func safeRelativePath(_ raw: String) -> String? {
    guard let decoded = raw.removingPercentEncoding, !decoded.contains("\\"), !decoded.contains("\0") else { return nil }
    let parts = decoded.split(separator: "/", omittingEmptySubsequences: true)
    guard !parts.isEmpty, !parts.contains(where: { $0 == ".." || $0 == "." }) else { return nil }
    return parts.joined(separator: "/")
}

func sha256Hex(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}

/// Every difference between a directory and the manifest inside it:
/// "missing: p", "changed: p", "extra: p". Empty when they match.
public func verifySiteBundle(at root: URL) throws -> [String] {
    let entries = try parseSiteManifest(Data(contentsOf: root.appendingPathComponent(siteManifestName)))
    var problems: [String] = []
    for e in entries {
        guard let data = try? Data(contentsOf: root.appendingPathComponent(e.path)) else {
            problems.append("missing: \(e.path)"); continue
        }
        if sha256Hex(data) != e.sha256 { problems.append("changed: \(e.path)") }
    }
    let listed = Set(entries.map(\.path) + [siteManifestName])
    let base = root.resolvingSymlinksInPath().path
    if let walk = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isRegularFileKey]) {
        for case let url as URL in walk where (try? url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true {
            let rel = String(url.resolvingSymlinksInPath().path.dropFirst(base.count + 1))
            if !listed.contains(rel) { problems.append("extra: \(rel)") }
        }
    }
    return problems
}

public func contentType(forPath path: String) -> String {
    switch (path as NSString).pathExtension.lowercased() {
    case "html": return "text/html;charset=utf-8"
    case "js", "mjs": return "text/javascript;charset=utf-8"
    case "css": return "text/css;charset=utf-8"
    case "json", "map": return "application/json;charset=utf-8"
    case "webmanifest": return "application/manifest+json"
    case "txt", "ts": return "text/plain;charset=utf-8"
    case "svg": return "image/svg+xml"
    case "png": return "image/png"
    case "jpg", "jpeg": return "image/jpeg"
    case "gif": return "image/gif"
    case "webp": return "image/webp"
    case "avif": return "image/avif"
    case "ico": return "image/x-icon"
    case "woff": return "font/woff"
    case "woff2": return "font/woff2"
    case "ttf": return "font/ttf"
    case "wasm": return "application/wasm"
    case "pdf": return "application/pdf"
    default: return "application/octet-stream"
    }
}

/// The site's files, read from the first root that has each one.
public struct SiteFiles: Sendable {
    let roots: @Sendable () -> [URL]

    /// `roots` is asked on every request, so a mirror that appears later is used at once.
    public init(roots: @escaping @Sendable () -> [URL]) { self.roots = roots }

    /// The response for a GET or HEAD the bridge does not own.
    func response(path: String, head: Bool) -> BridgeResponse {
        let notFound = BridgeResponse.text("Not found", status: 404)
        guard path.hasPrefix("/") else { return notFound }
        var rel = "index.html"
        if path != "/" {
            guard let safe = safeRelativePath(path) else { return notFound }
            // Hash routing: a path with no file extension is a route and gets the index.
            if !(safe.split(separator: "/").last ?? "").contains(".") { rel = "index.html" } else { rel = safe }
        }
        for root in roots() {
            guard let data = try? Data(contentsOf: root.appendingPathComponent(rel)) else { continue }
            let cache = rel.hasPrefix("assets/") ? "public, max-age=31536000, immutable" : "no-cache"
            var headers = [("Content-Type", contentType(forPath: rel)), ("Cache-Control", cache)]
            if head { headers.append(("Content-Length", String(data.count))) }
            return BridgeResponse(status: 200, headers: headers, body: .bytes(head ? Data() : data))
        }
        return notFound
    }
}

public struct SiteFetchResult: Sendable {
    public let status: Int
    public let contentType: String?
    public let body: Data
    public init(status: Int, contentType: String?, body: Data) {
        self.status = status
        self.contentType = contentType
        self.body = body
    }
}

public typealias SiteFetch = @Sendable (URL) async throws -> SiteFetchResult

/// A plain GET that skips every cache, for the mirror.
public let urlSessionSiteFetch: SiteFetch = { url in
    var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 30)
    request.httpMethod = "GET"
    let (data, response) = try await URLSession.shared.data(for: request)
    let http = response as? HTTPURLResponse
    return SiteFetchResult(status: http?.statusCode ?? 0, contentType: http?.value(forHTTPHeaderField: "Content-Type"), body: data)
}

/// A copy of the hosted site under `cache/current`, replaced whole or not at all.
public actor SiteMirror {
    let remote: URL
    let cache: URL
    let fetch: SiteFetch

    public init(remote: URL = hostedSite, cache: URL, fetch: @escaping SiteFetch = urlSessionSiteFetch) {
        self.remote = remote
        self.cache = cache
        self.fetch = fetch
    }

    nonisolated var current: URL { cache.appendingPathComponent("current") }

    /// The mirror's folder when there is a complete one.
    public nonisolated func currentRoot() -> URL? {
        FileManager.default.fileExists(atPath: current.appendingPathComponent(siteManifestName).path) ? current : nil
    }

    /// Fetch the hosted site's file list and every file on it whose hash the
    /// current mirror does not already hold, then swap the new copy in. Any
    /// failure (offline, no list, a file that does not match its hash) leaves
    /// the previous mirror as it was. Returns whether a new copy is in place.
    @discardableResult
    public func refresh() async -> Bool {
        let fm = FileManager.default
        let staging = cache.appendingPathComponent("incoming-\(UUID().uuidString)")
        defer { try? fm.removeItem(at: staging) }
        do {
            let list = try await fetch(remote.appendingPathComponent(siteManifestName))
            guard list.status == 200, (list.contentType ?? "").lowercased().contains("json") else { return false }
            let entries = try parseSiteManifest(list.body)
            let old = currentRoot()
            for e in entries {
                let target = staging.appendingPathComponent(e.path)
                try fm.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
                if let old, let have = try? Data(contentsOf: old.appendingPathComponent(e.path)), sha256Hex(have) == e.sha256 {
                    try have.write(to: target)
                    continue
                }
                let got = try await fetch(remote.appendingPathComponent(e.path))
                guard got.status == 200, sha256Hex(got.body) == e.sha256 else { return false }
                try got.body.write(to: target)
            }
            try list.body.write(to: staging.appendingPathComponent(siteManifestName))
            let retired = cache.appendingPathComponent("retired-\(UUID().uuidString)")
            if fm.fileExists(atPath: current.path) { try fm.moveItem(at: current, to: retired) }
            try fm.moveItem(at: staging, to: current)
            try? fm.removeItem(at: retired)
            return true
        } catch {
            return false
        }
    }
}
