/**
 * The reader's kept choice of the local Claude CLI (M54, ISC-549).
 *
 * The one persistent store in the auth and inference surface, and deliberately
 * outside every file that touches a credential. ISC-37 bans localStorage from
 * `auth/AuthPanel.tsx`, `auth/claudeAuth.ts` and `inference/anthropic.ts` by
 * text (`tests/auth.test.ts`), and that ban stays blanket: the panel reaches
 * persistence only through the three functions below. The value is the literal
 * "cli" and never anything else (`tests/m54-provider-kept.test.ts`). The
 * subscription credential stays with the CLI, and the console key stays
 * session-only. Lead's ruling, 2026-09-26, recorded under ISC-37 in ISA.md.
 *
 * localStorage rather than sessionStorage so a second tab and tomorrow's visit
 * are connected too; on the hosted site there is no dev proxy to detect the
 * bridge through, so a kept choice is the only way back in connected.
 */

export const CLI_PROVIDER_KEY = "abductive.provider";

/** True when the reader chose the local CLI, in this tab or any other. */
export function cliChoiceKept(): boolean {
  try {
    return localStorage.getItem(CLI_PROVIDER_KEY) === "cli";
  } catch {
    return false;
  }
}

/** Keep the choice. Writes the literal "cli" and nothing else. */
export function keepCliChoice(): void {
  try {
    localStorage.setItem(CLI_PROVIDER_KEY, "cli");
  } catch {
    // Storage refused; the page that asked still connects.
  }
}

/** Forget the choice. */
export function dropCliChoice(): void {
  try {
    localStorage.removeItem(CLI_PROVIDER_KEY);
  } catch {
    // Nothing stored to remove.
  }
}

/*
 * M56, ISC-558. The lane the reader picked on the card: Claude Code, Codex or,
 * since M60, a local model. Kept beside the "cli" choice under its own key, as
 * the lane's literal name and nothing else, so the static guarantee above
 * stands: no credential, no token, no version, only one of the three words below.
 */

export type Lane = "claude" | "codex" | "local";
export const LANE_KEY = "abductive.lane";

const LANES: readonly Lane[] = ["claude", "codex", "local"];
const asLane = (value: unknown): Lane => (LANES.includes(value as Lane) ? (value as Lane) : "claude");

/** The pick for this page when the store refuses; never read while the store works. */
let laneThisPage: Lane = "claude";

/** The kept lane; "claude" until the reader picks, or when the store holds anything else. */
export function keptLane(): Lane {
  try {
    return asLane(localStorage.getItem(LANE_KEY));
  } catch {
    return laneThisPage;
  }
}

/** Keep the lane. Writes the literal "claude", "codex" or "local" and nothing else. */
export function keepLane(lane: Lane): void {
  laneThisPage = asLane(lane);
  try {
    localStorage.setItem(LANE_KEY, laneThisPage);
  } catch {
    // Storage refused; this page still uses the lane it was given.
  }
}

/*
 * M60, ISC-578. The local model the reader picked, kept under its own key: a
 * model name the server listed, such as "llama3.2:1b", and never a credential.
 * The local server's key, when one is asked, is session-only in claudeAuth.ts.
 */

export const LOCAL_MODEL_KEY = "abductive.localModel";

/** The pick for this page when the store refuses. */
let localModelThisPage: string | null = null;

/**
 * A model name as servers list them: no whitespace, no credential shape. A
 * key typed into the wrong field must never reach a persistent store.
 */
function modelName(name: string): string {
  const n = name.trim();
  if (n === "" || /\s/.test(n) || n.length > 200 || /^(sk-|AIza)/.test(n)) {
    throw new Error("That isn't a model name the server listed.");
  }
  return n;
}

/** The kept local model, or null until the reader connects the local lane. */
export function keptLocalModel(): string | null {
  try {
    const v = localStorage.getItem(LOCAL_MODEL_KEY);
    return v === null || v === "" ? null : v;
  } catch {
    return localModelThisPage;
  }
}

/** Keep the local model. Writes the model's name and nothing else; refuses anything else. */
export function keepLocalModel(name: string): void {
  const n = modelName(name);
  localModelThisPage = n;
  try {
    localStorage.setItem(LOCAL_MODEL_KEY, n);
  } catch {
    // Storage refused; this page still uses the model it was given.
  }
}

/*
 * M61 follow-up, ISC-591. The model the reader picked for each CLI lane, kept
 * the way the local lane's is. Only a name on the lane's own list is kept:
 * Claude Code's three aliases, each of which it resolves to Anthropic's newest
 * model of that kind, and the models the Codex lane offers, the same list as
 * CODEX_MODELS in scripts/cli-bridge.ts (tests/m61-cli-models.test.tsx holds
 * the two to one list).
 */

export type CliModelLane = Exclude<Lane, "local">;

export const CLI_MODEL_CHOICES: Readonly<Record<CliModelLane, readonly string[]>> = {
  claude: ["sonnet", "opus", "haiku"],
  codex: ["gpt-5.6-sol", "gpt-6.1-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5"],
};

export const CLI_MODEL_KEY: Readonly<Record<CliModelLane, string>> = {
  claude: "abductive.cliModel.claude",
  codex: "abductive.cliModel.codex",
};

/** The picks for this page when the store refuses. */
const cliModelThisPage: Partial<Record<CliModelLane, string>> = {};

/** The kept model for a CLI lane, or null when none is kept or the kept one is off the list. */
export function keptCliModel(lane: CliModelLane): string | null {
  let v: string | null | undefined;
  try {
    v = localStorage.getItem(CLI_MODEL_KEY[lane]);
  } catch {
    v = cliModelThisPage[lane];
  }
  return v !== null && v !== undefined && CLI_MODEL_CHOICES[lane].includes(v) ? v : null;
}

/** Keep a CLI lane's model. Refuses anything off the lane's list, so nothing else is ever stored. */
export function keepCliModel(lane: CliModelLane, model: string): void {
  if (!CLI_MODEL_CHOICES[lane].includes(model)) throw new Error("That isn't a model this tool offers.");
  cliModelThisPage[lane] = model;
  try {
    localStorage.setItem(CLI_MODEL_KEY[lane], model);
  } catch {
    // Storage refused; this page still uses the model it was given.
  }
}
