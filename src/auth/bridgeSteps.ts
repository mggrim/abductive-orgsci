/**
 * What the "Use local Claude CLI" card says at each step (M54, ISC-547, ISC-548).
 *
 * The bridge's health reply decides the step; each step has one sentence and
 * at most the commands that step needs. The strings live here, apart from the
 * component, so the copy bar and the tests read the same text the reader does.
 */

import { type BridgeHealth, laneHealth, type LocalLaneHealth, localServerName } from "../inference/cliBridge.ts";
import type { Lane } from "../inference/providerChoice.ts";

/**
 * The bridge's own two states are shared by every lane; each CLI lane then has
 * its own missing and signed-out steps (M56), and the local lane (M60) its
 * own: no server, a server with no models, a server asking for a key, and a
 * bridge too old to know the lane. Claude's keep their M54 names.
 */
export type BridgeStep =
  | "no-bridge"
  | "port-taken"
  | "no-claude"
  | "signed-out"
  | "no-codex"
  | "codex-signed-out"
  | "no-local"
  | "local-no-models"
  | "local-needs-key"
  | "local-old-bridge"
  | "ready";

/** The one step left for a lane, from the bridge's reply. */
export function bridgeStep(health: BridgeHealth, lane: Lane = "claude"): BridgeStep {
  if (!health.ok) {
    return health.reason === "timeout" || health.reason === "not-bridge" ? "port-taken" : "no-bridge";
  }
  if (lane === "local") {
    const local = health.providers?.local;
    if (local === undefined) return "local-old-bridge";
    if (!local.reachable) return "no-local";
    if (local.needsKey) return "local-needs-key";
    return local.models.length === 0 ? "local-no-models" : "ready";
  }
  const cli = laneHealth(health, lane);
  if (cli.version === null) return lane === "codex" ? "no-codex" : "no-claude";
  // null is a bridge that cannot tell; trying costs one failed call at worst.
  if (cli.signedIn === false) return lane === "codex" ? "codex-signed-out" : "signed-out";
  return "ready";
}

/** What each lane is called on the card and in the connected sentence. */
export const LANE_NAME: Record<Lane, string> = { claude: "Claude Code", codex: "Codex", local: "a local model" };
/** The three radio-style controls that pick the lane. */
export const LANE_LABEL: Record<Lane, string> = { claude: "Use Claude Code", codex: "Use Codex", local: "Use a local model" };

/** One sentence per step that needs the reader to do something. */
export const STEP_SENTENCE: Record<Exclude<BridgeStep, "ready">, string> = {
  "no-bridge":
    "The bridge isn't running on this machine yet. Paste the command below into a terminal to start the bridge, and Abductive connects once it's running.",
  "port-taken":
    "Another program on this machine is using port 8787, the port that the bridge needs. Quit that program, then start the bridge with the command below.",
  "no-claude":
    "The bridge is running, but this machine doesn't have Claude Code yet. Install Claude Code with the line below, and Abductive connects once you've signed in.",
  "signed-out":
    "Claude Code is on this machine, and you haven't signed in to it yet. Run claude once in a terminal and sign in, and Abductive connects once you have.",
  "no-codex":
    "The bridge is running, but this machine doesn't have Codex yet. Install Codex with the line below, and Abductive connects once you've signed in.",
  "codex-signed-out":
    "Codex is on this machine, and you haven't signed in to it yet. Run codex login in a terminal and sign in, and Abductive connects once you have.",
  "no-local":
    "The bridge is running, but none of the local model servers on this Mac answered. Start one with the line for your server below, and Abductive connects once it's running.",
  // The two below name the server; localSentence writes them with its name and port.
  "local-no-models": "Add a model to the local model server, and Abductive connects once the model is there.",
  "local-needs-key":
    "The local model server asks for a key. Type the server's key in the field below, and Abductive connects once the key works.",
  "local-old-bridge":
    "The bridge on this Mac doesn't know about local models yet. Download Abductive Bridge again, or start the bridge again with the command below.",
};

/** What the card says while it waits, per step. */
export const WAITING: Record<Exclude<BridgeStep, "ready">, string> = {
  "no-bridge": "Waiting for the bridge to start…",
  "port-taken": "Waiting for the bridge to start…",
  "no-claude": "Waiting for you to install Claude Code and sign in…",
  "signed-out": "Waiting for you to sign in to Claude Code…",
  "no-codex": "Waiting for you to install Codex and sign in…",
  "codex-signed-out": "Waiting for you to sign in to Codex…",
  "no-local": "Waiting for a local model server to start…",
  "local-no-models": "Waiting for a model on the server…",
  "local-needs-key": "Waiting for the server's key…",
  "local-old-bridge": "Waiting for the new bridge to start…",
};

/*
 * M83, ISC-701. The repository route: on the dev server the page reaches the
 * CLI through scripts/cli-bridge.ts, which `bun run dev` starts, and no app is
 * involved. A co-author could not install the app (2026-10-05), so on the dev
 * server the steps for the two CLI lanes name the CLI and no bridge, and the
 * card offers no app (AuthPanel). The hosted site's sentences and the local
 * lane's are unchanged.
 */
type CliLaneStep = "no-bridge" | "port-taken" | "no-claude" | "no-codex";

function devSentence(step: CliLaneStep, cli: string): string {
  switch (step) {
    case "no-bridge":
      return `Abductive can't reach ${cli} on this machine yet. Run bun run bridge in a second terminal from the abductive folder, and Abductive connects to ${cli} once the command is running.`;
    case "port-taken":
      return `Another program on this machine is using the port that Abductive needs to reach ${cli}. Quit that program, then run the command below.`;
    case "no-claude":
    case "no-codex":
      return `This machine doesn't have ${cli} yet. Install ${cli} with the line below, and Abductive connects once you've signed in.`;
  }
}

const DEV_STEPS: ReadonlySet<BridgeStep> = new Set(["no-bridge", "port-taken", "no-claude", "no-codex"]);

/** The step's sentence for this lane, on the dev server or the hosted site. */
export function stepSentence(step: Exclude<BridgeStep, "ready">, lane: Lane, devServer: boolean): string {
  if (devServer && lane !== "local" && DEV_STEPS.has(step)) return devSentence(step as CliLaneStep, LANE_NAME[lane]);
  return STEP_SENTENCE[step];
}

/** What the card says while it waits, with the dev server's two CLI-lane lines naming the CLI. */
export function waitingLine(step: Exclude<BridgeStep, "ready">, lane: Lane, devServer: boolean): string {
  if (devServer && lane !== "local" && (step === "no-bridge" || step === "port-taken")) {
    return `Waiting for Abductive to reach ${LANE_NAME[lane]}…`;
  }
  return WAITING[step];
}

/** What the card says while it first looks. */
export function lookingLine(lane: Lane, devServer: boolean): string {
  return devServer && lane !== "local" ? `Looking for ${LANE_NAME[lane]}…` : "Looking for the bridge…";
}

export const GAVE_UP =
  "Abductive stopped waiting after 10 minutes. Press Use Claude Code, Use Codex or Use a local model to check again.";

/*
 * M60, ISC-578. The local lane's own lines.
 */

/** One line per known server on how to start it, shown when no server answered. */
export const LOCAL_START: readonly string[] = [
  "Ollama: run ollama serve, then ollama pull <model>.",
  "LM Studio: run lms server start, then load a model in LM Studio.",
  "llama.cpp: run llama-server -m <model file>, which listens on port 8080.",
];

/** The line the local lane always carries: the zero-egress lane for sensitive material. */
export const LOCAL_STAYS = "A local model runs on this Mac, and your data stays on this Mac.";

/** The server as a sentence's subject: "Ollama", or "The server" for a bare port. */
function serverSubject(endpoint: string): { name: string; port: string } {
  const name = localServerName(endpoint);
  const port = /:(\d+)$/.exec(endpoint)?.[1] ?? "";
  return { name: name.startsWith("port ") ? "the server" : name, port };
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The two local steps that name the server, with its name and port. */
export function localSentence(step: "local-no-models" | "local-needs-key", local: LocalLaneHealth): string {
  if (local.endpoint === null) return STEP_SENTENCE[step];
  const { name, port } = serverSubject(local.endpoint);
  if (step === "local-needs-key") {
    return `${capital(name)} on port ${port} asks for a key. Type the server's key in the field below, and Abductive connects once the key works.`;
  }
  const add =
    name === "Ollama"
      ? "Run ollama pull <model> in a terminal"
      : name === "LM Studio"
        ? "Load a model in LM Studio"
        : "Load a model into the server";
  return `${capital(name)} is running on port ${port}. ${add}, and Abductive connects once the model is there.`;
}

/** The connected sentence for the local lane: the server, its port and the model in use. */
export function localConnectedSentence(endpoint: string, model: string): string {
  const { name, port } = serverSubject(endpoint);
  return `You're connected to ${name} on port ${port}, using ${model}.`;
}

/**
 * Under the Claude lane's three models (ISC-591): the names are Claude Code's
 * own aliases, each resolved to Anthropic's newest model of that kind, and the
 * record shows the model it resolved to.
 */
export const CLAUDE_ALIAS_SENTENCE =
  "Each name follows Anthropic's newest model of that kind, so the project moves up when Claude Code does.";

/** What the card says while it checks a Codex model the reader picked (ISC-591). */
export function codexCheckingSentence(model: string): string {
  return `Checking that Codex runs ${model}…`;
}

/** Said when the endpoint field holds an address off this Mac, which the card never sends. */
export const LOCAL_ENDPOINT_REFUSED =
  "The server has to be on this Mac. Type the server's port, such as 11434, or an address on localhost or 127.0.0.1.";

/**
 * The connected sentence, with the CLI's version number when the bridge gave
 * one: the first word that looks like a version, so "2.1.283 (Claude Code)"
 * and "codex-cli 0.146.0" both give the number.
 */
export function connectedSentence(version: string | null | undefined, lane: Lane = "claude"): string {
  const number = version?.trim().split(/\s+/).find((w) => /^\d+(\.\d+)+/.test(w));
  return number !== undefined
    ? `You're connected through ${LANE_NAME[lane]} ${number} on this machine.`
    : `You're connected through ${LANE_NAME[lane]} on this machine.`;
}

export const BUN_INSTALL = "curl -fsSL https://bun.sh/install | bash";
export const CLAUDE_INSTALL = "npm install -g @anthropic-ai/claude-code";
export const CODEX_INSTALL = "npm install -g @openai/codex";

/**
 * The command that starts the bridge. On the dev server the checkout already
 * has it; anywhere else the reader downloads it from the page's own origin,
 * which on the hosted site is https://abductive.pages.dev.
 */
export function startCommand(origin: string, devServer: boolean): string {
  return devServer
    ? "bun run bridge"
    : `curl -fsSL ${origin}/bridge.ts -o abductive-bridge.ts && bun abductive-bridge.ts`;
}

export interface CommandLine {
  readonly command: string;
  readonly gloss: string;
}

/** The lines the card shows for a step, in order. */
export function commandsFor(step: BridgeStep, origin: string, devServer: boolean, lane: Lane = "claude"): CommandLine[] {
  switch (step) {
    case "no-bridge":
    case "port-taken":
      return [
        {
          command: startCommand(origin, devServer),
          /* M83, ISC-701: the dev server's CLI lanes name the CLI. */
          gloss:
            devServer && lane !== "local"
              ? `Run the command in your copy of Abductive. Abductive reaches ${LANE_NAME[lane]} only on this machine, and closing the terminal ends the connection.`
              : devServer
                ? "The command starts the bridge from your copy of Abductive. The bridge runs only on this machine, and closing the terminal stops it."
                : "The command downloads the bridge, a small program, from this site and runs it with Bun. The bridge runs only on this machine, and closing the terminal stops it.",
        },
        {
          command: BUN_INSTALL,
          gloss:
            "If the terminal can't find bun, install Bun with this line first, then open a new terminal and run the command above.",
        },
      ];
    case "no-claude":
      return [
        {
          command: CLAUDE_INSTALL,
          gloss:
            "This line installs Claude Code. Then run claude once in a terminal and sign in with your Claude account.",
        },
      ];
    case "signed-out":
      return [
        {
          command: "claude",
          gloss: "Claude Code opens in the terminal and asks you to sign in with your Claude account.",
        },
      ];
    case "no-codex":
      return [
        {
          command: CODEX_INSTALL,
          gloss:
            "This line installs Codex. Then run codex login in a terminal and sign in with your ChatGPT account.",
        },
      ];
    case "codex-signed-out":
      return [
        {
          command: "codex login",
          gloss: "Codex opens a page in your browser and asks you to sign in with your ChatGPT account.",
        },
      ];
    case "local-old-bridge":
      return commandsFor("no-bridge", origin, devServer, lane);
    case "no-local":
    case "local-no-models":
    case "local-needs-key":
      return [];
    case "ready":
      return [];
  }
}

/*
 * M55, ISC-553. Abductive Bridge, the Mac app that runs the bridge from the
 * menu bar. The card asks it to start through its URL scheme before showing
 * any path, and offers its download above the terminal path once the site
 * serves the DMG.
 */

/** Opens the app, or brings it forward and has it take the port. */
export const APP_SCHEME_URL = "abductive-bridge://start";
/** M57: the same, then the app opens Abductive on its own origin (the Safari card's control). */
export const APP_OPEN_URL = "abductive-bridge://open";
/** How long the card waits for the app to answer before it shows the paths. */
export const APP_LAUNCH_WAIT_MS = 3000;
export const APP_DOWNLOAD_PATH = "/AbductiveBridge.dmg";
export const APP_DOWNLOAD_LABEL = "Download Abductive Bridge";
export const APP_DOWNLOAD_GLOSS =
  "Abductive Bridge is a small app that lives in your Mac's menu bar and runs the bridge for you, without ever handling your Claude credential.";

/**
 * Ask the app to start, through a hidden frame rather than the page's own
 * location: a browser with no handler for the scheme would otherwise leave the
 * page for an error screen. The frame goes once the browser has had it.
 */
export function launchBridgeApp(
  doc: Document = document,
  removeAfterMs = 2000,
  url: string = APP_SCHEME_URL,
): HTMLIFrameElement {
  const frame = doc.createElement("iframe");
  frame.hidden = true;
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  frame.style.display = "none";
  frame.src = url;
  doc.body.appendChild(frame);
  setTimeout(() => frame.remove(), removeAfterMs);
  return frame;
}

/**
 * Whether the site serves the DMG. A 200 alone is not enough: Cloudflare Pages
 * answers a path it has no file for with the app's own index.html and a 200
 * (checked on abductive.pages.dev, 2026-09-26), and Vite's dev server does the
 * same, so an HTML answer counts as absent.
 */
export async function appDownloadAvailable(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(APP_DOWNLOAD_PATH, { method: "HEAD", cache: "no-store" });
    const type = res.headers.get("content-type") ?? "";
    return res.status === 200 && !type.toLowerCase().startsWith("text/html");
  } catch {
    return false;
  }
}

/*
 * M57, ISC-562. Safari blocks the hosted page's request to the bridge as mixed
 * content, so in Safari the card points to the page the app itself serves.
 */

export const SAFARI_SENTENCE =
  "Safari doesn't let a website talk to a program on your Mac, so Abductive can't reach the bridge. Open Abductive from the Abductive Bridge menu instead, or use Chrome or Firefox for this site.";
export const SAFARI_OPEN_LABEL = "Open Abductive from the app";
export const SAFARI_STUDIES =
  "Your browser keeps projects per address, so export a project from Export and open the file with Import project on the app's page.";
