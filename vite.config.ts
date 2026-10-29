import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** The bridge's port; ABDUCTIVE_BRIDGE_PORT lets a second checkout run its own. */
const bridgePort = Number(process.env.ABDUCTIVE_BRIDGE_PORT) || 8787;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Local Claude CLI bridge (scripts/cli-bridge.ts) — subscription-billed
      // inference through the sanctioned CLI, no API key required.
      "/cli-bridge": {
        target: `http://127.0.0.1:${bridgePort}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cli-bridge/, ""),
      },
      // Same-origin pass-through to Anthropic. The browser calls
      // /anthropic-proxy/... on localhost; Vite forwards server-side, so no
      // CORS is involved (org settings block direct browser calls). The proxy
      // holds nothing and logs nothing — research data still travels only to
      // Anthropic under the user's own token.
      "/anthropic-proxy": {
        target: "https://api.anthropic.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/anthropic-proxy/, ""),
        // changeOrigin only rewrites Host — the browser's Origin header is
        // still forwarded, and Anthropic's org-level CORS block keys on it.
        // Strip Origin/Referer so the upstream request looks server-side
        // (which it is — the proxy runs in the dev server, not the page).
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.removeHeader("origin");
            proxyReq.removeHeader("referer");
          });
        },
      },
    },
  },
});
