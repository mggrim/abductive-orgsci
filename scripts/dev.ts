export {};

/**
 * Dev entry point: the app and the local Claude CLI bridge together.
 *
 * The bridge was a separate `bun run bridge` in another terminal, so the
 * default experience was an app whose inference silently fell back to the mock
 * client. Personas produced fiction and nothing said so. One command now
 * starts both, and the bridge dies with the dev server rather than lingering
 * on port 8787 between sessions.
 */

const PORT = Number(process.env.ABDUCTIVE_BRIDGE_PORT) || 8787;

const bridge = Bun.spawn(["bun", "scripts/cli-bridge.ts"], {
  stdout: "inherit",
  stderr: "inherit",
});

const stopBridge = () => {
  bridge.kill();
};
process.on("SIGINT", () => {
  stopBridge();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopBridge();
  process.exit(0);
});
process.on("exit", stopBridge);

// Give the bridge a moment to bind 8787 before Vite proxies to it, then hand
// the terminal to Vite.
await Bun.sleep(400);

// Confirm the bridge is what answers on the port. Bun binds the IPv6 wildcard
// and reports success even when another process already holds the loopback
// addresses, so "listening" above can be true while every request from the
// app goes to the other process. Seen 2026-09-08 with a stale wrangler dev.
async function probeBridge(): Promise<string | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const body = (await res.json()) as { ok?: unknown };
    return body.ok === true ? null : `port ${PORT} answered, but not as the bridge`;
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return timedOut
      ? `port ${PORT} accepted the connection and never answered`
      : `nothing answered on port ${PORT}`;
  }
}

const problem = await probeBridge();
if (problem !== null) {
  const who = Bun.spawnSync(["lsof", "-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN"]);
  console.error(`\ncli-bridge: ${problem}. Another program is holding the port:\n`);
  console.error(new TextDecoder().decode(who.stdout));
  console.error(
    "Quit it, then run bun run dev again. The app has no working Claude connection until then.\n",
  );
}

const vite = Bun.spawn(["bunx", "vite"], { stdout: "inherit", stderr: "inherit" });
const code = await vite.exited;
stopBridge();
process.exit(code);
