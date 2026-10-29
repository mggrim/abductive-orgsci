/**
 * Which inference client the app runs on (ISC-37).
 *
 * MockInferenceClient by default; the local CLI bridge or a pasted console key
 * when one is present.
 *
 * M89 (2026-10-14): the trigger engine and the persona run that fired bias
 * flags at a step's save were here (`runStagePersonas`). They left main with
 * the checks, on the owner's instruction of 2026-10-14; the branch
 * `with-checks` keeps them.
 */

import { AnthropicInferenceClient, hasSessionToken } from "../inference/anthropic.ts";
import { OpenAICompatibleClient } from "../inference/openaiCompatible.ts";
import { getApiChoice } from "../auth/claudeAuth.ts";
import { MockInferenceClient } from "../inference/mock.ts";
import type { InferenceClient } from "../inference/types.ts";
import {
  bridgeDetected,
  bridgeProbeFailed,
  CliBridgeInferenceClient,
  cliProviderSelected,
} from "../inference/cliBridge.ts";
import { appOrigin } from "../inference/origin.ts";

/**
 * Mock by default; the local Claude CLI bridge when selected at #/auth;
 * otherwise a pasted console key when present.
 *
 * Bridge first, deliberately: it is the subscription path and the one where
 * the app holds no credential, so a machine with both configured should never
 * silently spend console credit.
 */
export function activeInferenceClient(): {
  client: InferenceClient;
  live: boolean;
} {
  // Selected explicitly, or simply running on this machine. See bridgeDetected.
  // A kept choice whose bridge the load probe found missing is not live (M54).
  // On the Mac app's origin the app served this page, so the bridge counts as
  // there until the probe says otherwise (M57, ISC-561).
  if (((cliProviderSelected() || appOrigin()) && !bridgeProbeFailed()) || bridgeDetected()) {
    return { client: new CliBridgeInferenceClient(), live: true };
  }
  if (hasSessionToken()) {
    // M60, ISC-580: the key's provider picks the client; no choice stored is Anthropic, as before.
    const choice = getApiChoice();
    if (choice.provider === "anthropic") {
      return { client: new AnthropicInferenceClient(choice.model === undefined ? {} : { model: choice.model }), live: true };
    }
    return { client: new OpenAICompatibleClient(), live: true };
  }
  return { client: new MockInferenceClient(), live: false };
}
