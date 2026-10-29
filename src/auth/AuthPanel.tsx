/**
 * Claude auth panel (ISC-37).
 *
 * "Model access" since M56. Two options, in order of preference:
 *   - Option A, the reader's own subscription through its command-line tool,
 *     reached through the local bridge: Claude through Claude Code, or ChatGPT
 *     through Codex, picked with two radio-style controls. Subscription
 *     billing, and the credential stays with the CLI: the app never holds one.
 *   - Option B, an Anthropic console key pasted by the researcher, held in
 *     sessionStorage under AUTH_TOKEN_SESSION_KEY only, via claudeAuth.ts.
 *     Billed per token against a console account, not against a subscription,
 *     and the panel says so rather than leaving the researcher to discover it
 *     on an invoice.
 *
 * The "Sign in with Claude" OAuth scaffold that used to sit here was removed
 * with the token-paste path it served. Anthropic rejects subscription OAuth
 * tokens on raw /v1/messages outside sanctioned apps, so the flow could not
 * have delivered subscription billing even once registration landed, and the
 * CLI bridge already does what it was for.
 *
 * Never renders a full key; shows the masked form only.
 */

import { useEffect, useRef, useState } from "react";
import {
  BRIDGE_HEALTH_TIMEOUT_MS,
  type BridgeHealth,
  checkBridgeHealth,
  clearCliProvider,
  CliBridgeInferenceClient,
  cliProviderSelected,
  DEFAULT_CODEX_MODEL,
  laneHealth,
  laneNotReady,
  localAsk,
  localEndpoint,
  type LocalLaneHealth,
  loopbackBlocked,
  selectCliProvider,
} from "../inference/cliBridge.ts";
import {
  CLI_MODEL_CHOICES,
  keepCliModel,
  keepLane,
  keepLocalModel,
  keptCliModel,
  keptLane,
  keptLocalModel,
  type Lane,
} from "../inference/providerChoice.ts";
import { devServerOrigin } from "../inference/origin.ts";
import {
  APP_DOWNLOAD_GLOSS,
  APP_DOWNLOAD_LABEL,
  APP_DOWNLOAD_PATH,
  APP_LAUNCH_WAIT_MS,
  APP_OPEN_URL,
  appDownloadAvailable,
  type BridgeStep,
  bridgeStep,
  CLAUDE_ALIAS_SENTENCE,
  codexCheckingSentence,
  commandsFor,
  connectedSentence,
  GAVE_UP,
  LANE_LABEL,
  launchBridgeApp,
  LOCAL_ENDPOINT_REFUSED,
  LOCAL_START,
  LOCAL_STAYS,
  localConnectedSentence,
  localSentence,
  SAFARI_OPEN_LABEL,
  SAFARI_SENTENCE,
  SAFARI_STUDIES,
  lookingLine,
  stepSentence,
  waitingLine,
} from "./bridgeSteps.ts";
import { API_PROVIDERS, type ApiProvider, type ApiRoute, compatibleBase, preferredModel, recordedProvider } from "../inference/apiProviders.ts";
import { listApiModels } from "../inference/openaiCompatible.ts";
import {
  API_LABEL,
  apiConnectedSentence,
  apiConnectReason,
  BASE_LABEL,
  BASE_REFUSED,
  BILLING,
  KEY_PLACEHOLDER,
  MODEL_LABEL,
  MODEL_TYPED_LABEL,
  NO_MODELS,
  OPTION_B_LEDE,
  OPTION_B_TITLE,
  ROUTE_SENTENCE,
} from "./apiSteps.ts";
import {
  clearApiChoice,
  clearLocalEndpoint,
  clearLocalKey,
  clearSessionToken,
  getApiChoice,
  getLocalEndpoint,
  getLocalKey,
  getSessionToken,
  looksLikeKey,
  looksLikeToken,
  maskToken,
  setApiChoice,
  setApiKey,
  setLocalEndpoint,
  setLocalKey,
  setSessionToken,
} from "./claudeAuth.ts";
import { InertNote, inertAttrs } from "../ui/components/index.ts";
import { MAIN_LANDMARK_ID } from "../ui/landmarks.ts";
import { HelpControl } from "../ui/HelpControl.tsx";

/** Why Connect is not live. The field is a password input, so the sentence has
 * to describe what a key looks like without echoing what was typed. */
function connectReason(draft: string): string | null {
  if (looksLikeToken(draft)) return null;
  if (draft.trim() === "") {
    return "Paste a console key first.";
  }
  return "Paste a whole console key, starting sk-ant-api.";
}

/** How often the card asks the bridge again while it waits (ISC-549). */
export const BRIDGE_POLL_MS = 3000;
/** How long the card waits before it stops asking. */
export const BRIDGE_WAIT_MS = 10 * 60 * 1000;

/** One command with its own Copy button and a sentence saying what it does. */
function CommandRow({ command, gloss }: { command: string; gloss: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      // No clipboard permission: the command is on screen to select by hand.
    }
  };
  return (
    <div className="bridge-command" data-command={command}>
      <div className="bridge-command-line">
        <code>{command}</code>
        <button type="button" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="muted" data-gloss>
        {gloss}
      </p>
    </div>
  );
}

export interface AuthPanelProps {
  /** Test seams; the app renders the panel with none of these. */
  readonly fetchImpl?: typeof fetch;
  readonly pollMs?: number;
  readonly waitMs?: number;
  /** M55: how the card asks the Mac app to start, and how long it waits for it. */
  readonly launchApp?: () => void;
  readonly launchWaitMs?: number;
  /** M57: how the Safari card asks the app to open Abductive on its own origin. */
  readonly openApp?: () => void;
}

/** How often the card asks again while it waits for the app to start. */
const APP_POLL_MS = 500;

export function AuthPanel({
  fetchImpl,
  pollMs = BRIDGE_POLL_MS,
  waitMs = BRIDGE_WAIT_MS,
  launchApp = () => void launchBridgeApp(),
  launchWaitMs = APP_LAUNCH_WAIT_MS,
  openApp = () => void launchBridgeApp(document, 2000, APP_OPEN_URL),
}: AuthPanelProps = {}) {
  const [token, setToken] = useState<string | null>(() => getSessionToken());
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cliActive, setCliActive] = useState<boolean>(() => cliProviderSelected());
  // M56: the lane in use, kept beside the "cli" choice. A ref too, because a
  // press changes the lane and probes in the same turn, before a re-render.
  const [lane, setLaneState] = useState<Lane>(() => keptLane());
  // ISC-591: the model each CLI lane uses, and what the card says about a Codex pick.
  const [claudeModel, setClaudeModel] = useState<string>(() => keptCliModel("claude") ?? "sonnet");
  const [codexModel, setCodexModel] = useState<string>(() => keptCliModel("codex") ?? DEFAULT_CODEX_MODEL);
  const [cliModelNote, setCliModelNote] = useState<string | null>(null);
  /** The Codex pick being checked, so a slow reply to an older pick cannot speak for a newer one. */
  const codexChecking = useRef<string | null>(null);
  const laneRef = useRef<Lane>(lane);
  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [step, setStep] = useState<Exclude<BridgeStep, "ready"> | null>(null);
  const [waiting, setWaiting] = useState<"no" | "yes" | "gave-up">("no");
  const [appOffered, setAppOffered] = useState(false);
  // M60: what the bridge found for the local lane, the model in use, and the two optional fields.
  const [localHealth, setLocalHealth] = useState<LocalLaneHealth | null>(null);
  const [localModel, setLocalModel] = useState<string | null>(() => keptLocalModel());
  const [endpointDraft, setEndpointDraft] = useState<string>(() => getLocalEndpoint() ?? "");
  const [endpointRefused, setEndpointRefused] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [localKey, setLocalKeyState] = useState<string | null>(() => getLocalKey());
  // M60, ISC-580: Option B's provider, its address, the model list and how calls reach it.
  const [apiProvider, setApiProvider] = useState<ApiProvider>(() => getApiChoice().provider);
  const [baseDraft, setBaseDraft] = useState<string>(() => getApiChoice().baseUrl ?? "");
  const [apiModels, setApiModels] = useState<string[] | null>(null);
  const [apiModel, setApiModel] = useState<string | null>(() => getApiChoice().model ?? null);
  const [apiRoute, setApiRoute] = useState<ApiRoute>(() => getApiChoice().route ?? "direct");
  const [baseRefused, setBaseRefused] = useState(false);
  const [listing, setListing] = useState(false);
  // M57: Safari on the hosted site cannot reach the bridge; read once per mount.
  const [safari] = useState(() => loopbackBlocked());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadline = useRef(0);
  const alive = useRef(true);

  const stopWaiting = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };

  // M60: the local lane's probe names the session's endpoint and key, in a POST body.
  const probe = (): Promise<BridgeHealth> =>
    checkBridgeHealth(fetchImpl ?? fetch, BRIDGE_HEALTH_TIMEOUT_MS, laneRef.current === "local" ? localAsk() : undefined);

  /** M60: keep the model in use: the reader's pick while the server still lists it, else the first. */
  const settleModel = (local: LocalLaneHealth | undefined) => {
    setLocalHealth(local ?? null);
    if (local === undefined || local.models.length === 0) return;
    const kept = keptLocalModel();
    const model = kept !== null && local.models.includes(kept) ? kept : local.models[0]!;
    if (model !== kept) keepLocalModel(model);
    setLocalModel(model);
  };

  /** Apply a health reply: connect when the lane is ready, else show its step. */
  const apply = (health: BridgeHealth): boolean => {
    const next = bridgeStep(health, laneRef.current);
    if (health.ok) settleModel(health.providers?.local);
    if (next === "ready") {
      stopWaiting();
      selectCliProvider();
      setVersion(laneRef.current === "local" ? null : (laneHealth(health, laneRef.current).version ?? null));
      setCliActive(true);
      setStep(null);
      setWaiting("no");
      return true;
    }
    if (cliActive || cliProviderSelected()) laneNotReady();
    setCliActive(false);
    setStep(next);
    return false;
  };

  /** M56: the reader picks a lane. It is kept at once, even when not installed, and checked. */
  const chooseLane = (next: Lane) => {
    laneRef.current = next;
    setLaneState(next);
    keepLane(next);
    void useCliBridge();
  };

  const poll = () => {
    timer.current = setTimeout(async () => {
      if (!alive.current || timer.current === null) return;
      const health = await probe();
      if (!alive.current || timer.current === null) return;
      if (apply(health)) return;
      if (Date.now() >= deadline.current) {
        stopWaiting();
        setWaiting("gave-up");
        return;
      }
      poll();
    }, pollMs);
  };

  /**
   * M55. On the hosted site with no bridge answering, ask the Mac app to start
   * and give it a few seconds before showing any path. Returns the last reply,
   * which is ready when the app answered inside the wait.
   */
  async function tryTheApp(): Promise<BridgeHealth> {
    launchApp();
    const until = Date.now() + launchWaitMs;
    let last: BridgeHealth = { ok: false, reason: "unreachable" };
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, Math.min(APP_POLL_MS, pollMs, Math.max(0, until - Date.now()))));
      if (!alive.current) return last;
      last = await probe();
      if (!alive.current) return last;
      if (bridgeStep(last, laneRef.current) === "ready") return last;
    }
    return last;
  }

  /** Read the machine, then connect or show the step and wait for it. */
  async function useCliBridge() {
    stopWaiting();
    setChecking(true);
    let health = await probe();
    if (!alive.current) return;
    if (!devServerOrigin() && bridgeStep(health) === "no-bridge") {
      health = await tryTheApp();
      if (!alive.current) return;
    }
    setChecking(false);
    if (apply(health)) return;
    deadline.current = Date.now() + waitMs;
    setWaiting("yes");
    poll();
  }

  // ISC-550: the card opens on the reader's step, not on a button to find it.
  useEffect(() => {
    alive.current = true;
    // Safari on the hosted site: no probe, since it can only fail (M57).
    if (safari) {
      /* the card shows the way to the app's page instead */
    } else if (!cliProviderSelected()) void useCliBridge();
    else
      void probe().then((health) => {
        if (!alive.current || !health.ok) return;
        settleModel(health.providers?.local);
        if (laneRef.current !== "local") setVersion(laneHealth(health, laneRef.current).version ?? null);
      });
    // M55: the download is offered only once the site serves the DMG. M83,
    // ISC-701: never on the dev server, which serves the DMG too but whose
    // route to Claude Code is the CLI alone, so it is not asked at all.
    if (!devServerOrigin()) {
      void appDownloadAvailable(fetchImpl).then((served) => {
        if (alive.current) setAppOffered(served);
      });
    }
    return () => {
      alive.current = false;
      stopWaiting();
    };
    // Once per arrival; the seams do not change under a mounted panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function disableCliBridge() {
    stopWaiting();
    clearCliProvider();
    setCliActive(false);
    setVersion(null);
    setStep(null);
    setWaiting("no");
  }

  /** M60: the reader checks the local server again, with the endpoint and key they typed. */
  const checkLocal = () => {
    const typed = endpointDraft.trim();
    const endpoint = typed === "" ? null : localEndpoint(typed);
    if (typed !== "" && endpoint === null) {
      setEndpointRefused(true);
      return;
    }
    setEndpointRefused(false);
    if (endpoint === null) clearLocalEndpoint();
    else {
      setLocalEndpoint(endpoint);
      setEndpointDraft(endpoint);
    }
    if (keyDraft.trim() !== "") {
      try {
        setLocalKey(keyDraft);
        setLocalKeyState(getLocalKey());
        setKeyDraft("");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    void useCliBridge();
  };

  const forgetLocalKey = () => {
    clearLocalKey();
    setLocalKeyState(null);
  };

  const chooseLocalModel = (model: string) => {
    keepLocalModel(model);
    setLocalModel(model);
  };

  /**
   * A CLI lane's model (ISC-591). The pick is kept at once, beside the lane.
   * Claude's names are Claude Code's own aliases and always run. A Codex pick is
   * checked with one short call through the bridge, because a ChatGPT sign-in
   * refuses some of the models Codex lists; a refusal shows Codex's own sentence
   * and the pick stays chosen, so the reader sees what was refused and changes
   * it (the lead's ruling, 2026-09-30).
   */
  const chooseCliModel = (model: string) => {
    if (lane === "claude") {
      keepCliModel("claude", model);
      setClaudeModel(model);
      return;
    }
    if (lane !== "codex" || model === codexModel) return;
    keepCliModel("codex", model);
    setCodexModel(model);
    setCliModelNote(codexCheckingSentence(model));
    codexChecking.current = model;
    const note = (text: string | null) => {
      if (codexChecking.current === model) setCliModelNote(text);
    };
    const check = new CliBridgeInferenceClient({ lane: "codex", model, ...(fetchImpl === undefined ? {} : { fetchImpl }) });
    void check
      .complete({ system: "", messages: [{ role: "user", content: "Reply with OK." }], maxTokens: 16 })
      .then(() => note(null))
      .catch((err: unknown) => note(err instanceof Error ? err.message : String(err)));
  };

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const devServer = devServerOrigin();
  const commands = step === null ? [] : commandsFor(step, origin, devServer, lane);

  /** Why Connect is not live for the provider picked. Anthropic keeps its own sentences. */
  const keyReason = (): string | null =>
    apiProvider === "anthropic"
      ? connectReason(draft)
      : apiConnectReason(apiProvider, draft, looksLikeKey(apiProvider, draft), baseDraft.trim() !== "");

  /** Keep the choice with the model picked, for this session only. */
  const keepChoice = (model: string | null, route: ApiRoute, base: string | null) => {
    setApiChoice({
      provider: apiProvider,
      ...(base === null ? {} : { baseUrl: base }),
      ...(model === null ? {} : { model }),
      route,
    });
  };

  const connect = async () => {
    // setSessionToken would throw on a malformed key and the catch below would
    // render it as an error, which is the tool telling the researcher off for
    // pressing a control it drew as pressable.
    if (keyReason() !== null) return;
    setError(null);
    if (apiProvider === "anthropic") {
      // As before M60: the key is taken at once; the model list follows, and a
      // list that cannot be read leaves the client on its default model.
      try {
        setSessionToken(draft);
        keepChoice(null, "direct", null);
        const key = draft;
        setDraft("");
        setToken(getSessionToken());
        void listApiModels({ provider: "anthropic" }, key, fetchImpl ?? fetch).then((listed) => {
          if (!alive.current || "error" in listed || listed.models.length === 0) return;
          const model = preferredModel("anthropic", listed.models);
          setApiModels(listed.models);
          setApiModel(model);
          keepChoice(model, "direct", null);
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
      return;
    }
    const base = apiProvider === "compatible" ? compatibleBase(baseDraft) : null;
    if (apiProvider === "compatible" && base === null) {
      setBaseRefused(true);
      return;
    }
    setBaseRefused(false);
    setListing(true);
    const choice = { provider: apiProvider, ...(base === null ? {} : { baseUrl: base }) };
    const listed = await listApiModels(choice, draft.trim(), fetchImpl ?? fetch);
    if (!alive.current) return;
    setListing(false);
    if ("error" in listed) {
      setError(listed.error);
      return;
    }
    try {
      setApiKey(apiProvider, draft);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    const model = listed.models.length === 0 ? null : preferredModel(apiProvider, listed.models);
    keepChoice(model, listed.route, base);
    setApiModels(listed.models);
    setApiModel(model);
    setApiRoute(listed.route);
    setDraft("");
    setToken(getSessionToken());
  };

  const chooseApiModel = (model: string) => {
    const choice = getApiChoice();
    setApiChoice({ ...choice, model });
    setApiModel(model);
  };

  const disconnect = () => {
    clearSessionToken();
    clearApiChoice();
    setToken(null);
    setError(null);
    setApiModels(null);
    setApiModel(null);
  };

  /** The provider as the connected sentence names it: its name, or another service's host. */
  const apiName =
    apiProvider === "compatible" ? recordedProvider({ provider: "compatible", baseUrl: baseDraft }) : API_LABEL[apiProvider];

  return (
    <main className="panel auth-panel" id={MAIN_LANDMARK_ID} tabIndex={-1}>
      {/* M62, ISC-600: the lede moved into the page's Help control, which sits
          at the right end of the heading's row. */}
      <div className="page-head">
        <h1>Model access</h1>
        <HelpControl page="settings" />
      </div>

      <section className="card">
        {/* Was a bare <strong> as a block-level child, so the card's first line
            was an inline box and the gap under it was a line-box descender
            rather than anything the space scale declares: 3px measured where
            every other block interval on the page is 12. A paragraph, like
            Option B below it already was. */}
        <p>
          <strong>Subscription or local model</strong>
        </p>
        {/* R3, copy C6. One thing had two names and the second was never
            defined: the button said CLI, the off button said bridge, and every
            error message said bridge. The word is glossed where it first
            appears and the off button says CLI like the on button. */}
        {/* M83, ISC-701: on the dev server Abductive reaches the CLI with no
            app and no download, so the card names the copy of Abductive rather
            than a bridge. */}
        {devServer ? (
          <>
            <p className="muted" data-intro="dev">
              Use a subscription that you already have, Claude through Claude Code or ChatGPT through Codex,
              each a command-line tool (CLI) on this machine. Your copy of Abductive passes your questions to
              the CLI that you pick. Your questions go only to that CLI, and your credential stays with the CLI.
            </p>
            <p className="muted">
              You can also use a local model, one that you run in Ollama, LM Studio or llama.cpp on this
              machine. Abductive passes your questions to that server alone.
            </p>
          </>
        ) : (
          <>
            <p className="muted">
              Use a subscription that you already have, Claude through Claude Code or ChatGPT through Codex,
              each a command-line tool (CLI) on this machine. A small program on this machine (the
              bridge) passes your questions to the CLI that you pick. Your questions go only to that
              CLI, and your credential stays with the CLI.
            </p>
            <p className="muted">
              You can also use a local model, one that you run in Ollama, LM Studio or llama.cpp on this
              machine. The bridge passes your questions to that server alone.
            </p>
          </>
        )}
        {safari ? (
          <div className="bridge-step" data-step="safari">
            <p>{SAFARI_SENTENCE}</p>
            <p>
              <button type="button" className="primary" onClick={openApp} data-safari-open>
                {SAFARI_OPEN_LABEL}
              </button>
            </p>
            {appOffered && (
              <div className="bridge-app">
                <p>
                  <a className="btn" href={APP_DOWNLOAD_PATH} download data-download-app>
                    {APP_DOWNLOAD_LABEL}
                  </a>
                </p>
                <p className="muted">{APP_DOWNLOAD_GLOSS}</p>
              </div>
            )}
            <p className="muted" data-safari-studies>
              {SAFARI_STUDIES}
            </p>
          </div>
        ) : (
          <>
          <div className="lane-switch" role="radiogroup" aria-label="Which CLI this page uses">
            {(["claude", "codex", "local"] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={lane === l}
                className="lane-switch-option"
                data-lane={l}
                onClick={() => chooseLane(l)}
              >
                {LANE_LABEL[l]}
              </button>
            ))}
          </div>
          {cliActive && lane !== "local" && (
            <>
              <p>{connectedSentence(version, lane)}</p>
              {/* ISC-591: the lane's models, drawn the way the local lane draws its own. */}
              <div className="lane-switch cli-models" role="radiogroup" aria-label="Which model this page uses">
                {CLI_MODEL_CHOICES[lane].map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={(lane === "claude" ? claudeModel : codexModel) === m}
                    className="lane-switch-option"
                    data-cli-model={m}
                    onClick={() => chooseCliModel(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {lane === "claude" && <p className="muted">{CLAUDE_ALIAS_SENTENCE}</p>}
              {lane === "codex" && cliModelNote !== null && (
                <p className="muted" role="status" data-cli-model-note>
                  {cliModelNote}
                </p>
              )}
              <button onClick={disableCliBridge}>Disconnect</button>
            </>
          )}
          {cliActive && lane === "local" && localHealth?.endpoint != null && localModel !== null && (
            <div className="local-connected">
              <p>{localConnectedSentence(localHealth.endpoint, localModel)}</p>
              <div className="lane-switch local-models" role="radiogroup" aria-label="Which model this page uses">
                {localHealth.models.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={localModel === m}
                    className="lane-switch-option"
                    data-local-model={m}
                    onClick={() => chooseLocalModel(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <button onClick={disableCliBridge}>Disconnect</button>
            </div>
          )}
          {checking && step === null && !cliActive && (
            <p className="muted">{lookingLine(lane, devServer)}</p>
          )}
          {step !== null && !cliActive && (
            <div className="bridge-step" data-step={step}>
              {appOffered && (step === "no-bridge" || step === "port-taken") && (
                <div className="bridge-app">
                  <p>
                    <a className="btn btn-primary" href={APP_DOWNLOAD_PATH} download data-download-app>
                      {APP_DOWNLOAD_LABEL}
                    </a>
                  </p>
                  <p className="muted">{APP_DOWNLOAD_GLOSS}</p>
                </div>
              )}
              <p>
                {(step === "local-no-models" || step === "local-needs-key") && localHealth !== null
                  ? localSentence(step, localHealth)
                  : stepSentence(step, lane, devServer)}
              </p>
              {step === "no-local" && (
                <ul className="local-start" data-local-start>
                  {LOCAL_START.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              {commands.map((line) => (
                <CommandRow key={line.command} command={line.command} gloss={line.gloss} />
              ))}
              {waiting === "yes" && (
                <p className="muted bridge-waiting">
                  {waitingLine(step, lane, devServer)}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      stopWaiting();
                      setWaiting("no");
                    }}
                  >
                    Stop waiting
                  </button>
                </p>
              )}
              {waiting === "gave-up" && <p className="muted">{GAVE_UP}</p>}
            </div>
          )}
          {lane === "local" && (
            <div className="local-fields">
              <label>
                Port (optional)
                <input
                  type="text"
                  value={endpointDraft}
                  placeholder="11434 or http://127.0.0.1:11434"
                  autoComplete="off"
                  data-local-endpoint
                  onChange={(e) => {
                    setEndpointDraft(e.target.value);
                    setEndpointRefused(false);
                  }}
                />
              </label>
              {localKey === null ? (
                <label>
                  API key (optional)
                  <input
                    type="password"
                    value={keyDraft}
                    autoComplete="off"
                    data-local-key
                    onChange={(e) => setKeyDraft(e.target.value)}
                  />
                </label>
              ) : (
                <p>
                  Abductive keeps the server's key for this browser session only: <code>{maskToken(localKey)}</code>{" "}
                  <button type="button" onClick={forgetLocalKey}>
                    Delete key
                  </button>
                </p>
              )}
              <button type="button" onClick={checkLocal} data-local-check>
                Check server
              </button>
              {endpointRefused && <p className="error">{LOCAL_ENDPOINT_REFUSED}</p>}
              <p className="muted" data-local-stays>
                {LOCAL_STAYS}
              </p>
            </div>
          )}
          </>
        )}
      </section>

      {/* Option B is one card, like Option A above it. The title used to sit
          outside the section as a stray paragraph, so it read as a caption
          under the card above rather than the heading of the field below. */}
      <section className="card" data-option-b>
        <p>
          <strong>{OPTION_B_TITLE}</strong>
        </p>
        {token !== null ? (
          <>
            <p>
              {apiConnectedSentence(apiName)} <code>{maskToken(token)}</code>, kept for this browser session only.
            </p>
            <p className="muted">{BILLING[apiProvider]}</p>
            {apiModels !== null && apiModels.length > 0 && (
              <label className="api-model">
                {MODEL_LABEL}
                <select
                  value={apiModel ?? ""}
                  data-api-model
                  onChange={(e) => chooseApiModel(e.target.value)}
                >
                  {apiModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {apiModels !== null && apiModels.length === 0 && apiProvider !== "anthropic" && (
              <label className="api-model">
                {NO_MODELS}
                <input
                  type="text"
                  value={apiModel ?? ""}
                  aria-label={MODEL_TYPED_LABEL}
                  autoComplete="off"
                  data-api-model-typed
                  onChange={(e) => chooseApiModel(e.target.value.trim())}
                />
              </label>
            )}
            {apiModels === null && apiModel !== null && (
              <p className="muted">
                {MODEL_LABEL}: <code>{apiModel}</code>
              </p>
            )}
            {apiProvider !== "anthropic" && <p className="muted">{ROUTE_SENTENCE[apiRoute]}</p>}
            <button type="button" onClick={disconnect}>
              Disconnect
            </button>
          </>
        ) : (
          <>
          <p className="muted">{OPTION_B_LEDE}</p>
          <div className="lane-switch" role="radiogroup" aria-label="Provider">
            {API_PROVIDERS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={apiProvider === p}
                className="lane-switch-option"
                data-api-provider={p}
                onClick={() => {
                  setApiProvider(p);
                  setError(null);
                  setBaseRefused(false);
                }}
              >
                {API_LABEL[p]}
              </button>
            ))}
          </div>
          <p className="muted" data-billing>
            {BILLING[apiProvider]}
          </p>
          {apiProvider === "compatible" && (
            <label className="api-base">
              {BASE_LABEL}
              <input
                type="url"
                value={baseDraft}
                placeholder="https://api.example.com/v1"
                autoComplete="off"
                data-api-base
                onChange={(e) => {
                  setBaseDraft(e.target.value);
                  setBaseRefused(false);
                }}
              />
            </label>
          )}
          {baseRefused && <p className="error">{BASE_REFUSED}</p>}
          <input
            type="password"
            value={draft}
            placeholder={KEY_PLACEHOLDER[apiProvider]}
            autoComplete="off"
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            type="button"
            onClick={() => void connect()}
            data-api-connect
            {...inertAttrs("token-connect", keyReason())}
          >
            {listing ? "Checking key…" : "Connect"}
          </button>
          <InertNote control="token-connect" reason={keyReason()} />
          </>
        )}
      </section>

      {error !== null && <p className="error">{error}</p>}

      <aside className="muted">
        <h2>Privacy</h2>
        <p>
          Your research data stays in this browser. Model calls go only to the model that you connect,
          whether that's a CLI or a local model on this machine or the provider whose
          key you gave. A key lives in this tab only, stays off the disk, and is gone as soon as
          you close the tab. Upload anonymised or consented material only.
        </p>
      </aside>
    </main>
  );
}
