/**
 * Where the page is served from, and what exists there (M36).
 *
 * Two of this app's network paths are dev-server paths and nothing but the dev
 * server answers them. `/cli-bridge` is proxied to the local Claude Code CLI
 * bridge and `/anthropic-proxy` is proxied to api.anthropic.com, both declared
 * in `vite.config.ts`. On a static host neither proxy exists, so a request to
 * either lands on whatever that host does with an unknown path.
 *
 * That is a correctness problem in one direction and a manners problem in the
 * other. The API path has to reach Anthropic some other way or the console-key
 * route does not work at all. The bridge path is fine either way, because the
 * probe is same-origin and bounded, but it is still a request per page load
 * for something that cannot be there, and a host that rewrites unknown paths
 * to `index.html` answers it with a page rather than a refusal.
 *
 * So both ask this first. The rule is the narrow one: the dev server runs on
 * loopback, and a hostname that is not loopback is not it. A machine reached
 * over a LAN or a tailnet by name is treated as hosted, which is the safe way
 * round: it costs that reader a proxy they could have used, rather than
 * costing every hosted reader a path that cannot work.
 */

const LOOPBACK: readonly string[] = ["localhost", "127.0.0.1", "::1", "[::1]", ""];

/**
 * The bridge's port as the page sees it. 8787 unless the build named another
 * (VITE_BRIDGE_PORT), which exists so a build can be checked against a second
 * bridge without stopping the one already on 8787.
 */
export function bridgePortForPage(): number {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const n = Number(env?.VITE_BRIDGE_PORT);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 8787;
}

function isLoopback(host: string): boolean {
  return LOOPBACK.includes(host) || host.endsWith(".localhost");
}

/** The page's hostname and port, read at call time (see devServerOrigin). */
function here(hostname?: string, port?: string): { host: string; port: string } {
  if (hostname !== undefined) return { host: hostname, port: port ?? "" };
  if (typeof window === "undefined") return { host: "", port: "" };
  return { host: window.location.hostname, port: window.location.port };
}

/**
 * True when Abductive Bridge, the Mac app, is serving this page (M57, ISC-561).
 *
 * The app serves the site on the bridge's own port on loopback, so the page and
 * the bridge are one origin in every browser, Safari included. Nothing else
 * serves the page there: the dev server runs on its own port and proxies to the
 * bridge. The app answers the bridge under /cli-bridge as the dev server's
 * proxy does, and has no /anthropic-proxy.
 */
export function appOrigin(hostname?: string, port?: string): boolean {
  const at = here(hostname, port);
  return isLoopback(at.host) && at.port === String(bridgePortForPage());
}

/**
 * True when the Vite dev server's proxies are the thing answering this origin:
 * loopback, and not the app's origin.
 *
 * The default arguments are read at call time rather than at module load. In
 * Node, which is the eval harness, there is no `window` at all, and under test
 * one file can register a DOM that the next one cannot unregister out of a
 * constant already computed.
 */
export function devServerOrigin(hostname?: string, port?: string): boolean {
  const at = here(hostname, port);
  return isLoopback(at.host) && !appOrigin(at.host, at.port);
}

/**
 * True in Safari: WebKit with Safari's own token, and not Chrome (M57, ISC-562).
 *
 * WebKit treats an http loopback request from an https page as mixed content
 * and blocks it (WebKit bugs 171934 and 218627); Chrome and Firefox treat
 * loopback as trustworthy. The blocked fetch fails the same way as a bridge that
 * is not running, so the page reads the browser rather than the failure.
 */
export function safariBrowser(userAgent?: string): boolean {
  const ua = userAgent ?? (typeof navigator === "undefined" ? "" : navigator.userAgent);
  return /AppleWebKit\//.test(ua) && /Safari\//.test(ua) && !/(Chrome|Chromium|CriOS|Edg|EdgiOS|OPR|FxiOS)\//.test(ua);
}
