/**
 * What Option B says (M60, ISC-580). The strings live here, apart from the
 * component, so the copy bar and the tests read the same text the reader does,
 * as bridgeSteps.ts does for Option A.
 */

import type { ApiProvider } from "../inference/apiProviders.ts";

/** The five radio-style controls, in the card's order. */
export const API_LABEL: Record<ApiProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google Gemini",
  openrouter: "OpenRouter",
  compatible: "Another OpenAI-compatible service",
};

/** One sentence per provider, each naming whose account is charged. */
export const BILLING: Record<ApiProvider, string> = {
  anthropic:
    "Anthropic charges your console key per token, against your Anthropic console account rather than your Claude subscription.",
  openai: "OpenAI charges your API key per token, against your OpenAI API account rather than a ChatGPT subscription.",
  google:
    "Google charges your Gemini API key per token, against the Google Cloud project that the key belongs to, within any free tier that the project has.",
  openrouter: "OpenRouter charges your key per token, against the credits on your OpenRouter account.",
  compatible: "The service at that address charges your key, against your account with that service.",
};

/** What each key field shows before anything is typed. */
export const KEY_PLACEHOLDER: Record<ApiProvider, string> = {
  anthropic: "sk-ant-api…",
  openai: "sk-…",
  google: "AIza…",
  openrouter: "sk-or-…",
  compatible: "API key",
};

export const OPTION_B_TITLE = "API key";

export const OPTION_B_LEDE =
  "Use a key from a model provider on a machine without the bridge. The provider bills the key per token (a token is a few characters of text), against your own account with them. The key is the only credential Abductive ever stores, and a subscription or local model avoids both the charge and the credential.";

export const BASE_LABEL = "Service address";
export const BASE_REFUSED =
  "The address has to start with https:// and name the service's API, such as https://api.example.com/v1.";

/** How the page reaches the provider, said once connected. */
export const ROUTE_SENTENCE = {
  direct: "Calls go from this page straight to the provider.",
  relay:
    "This service doesn't take calls from a web page, so calls go through the bridge on this machine, which passes each one on without keeping a copy.",
} as const;

export const MODEL_LABEL = "Model";
export const MODEL_TYPED_LABEL = "Model";
export const NO_MODELS = "The provider's list for this key leaves out chat models, so type the model's name below.";

/** The connected sentence, with the key masked. The provider is named, or the service's host. */
export function apiConnectedSentence(name: string): string {
  return `You're connected to ${name} with key`;
}

/** Why Connect is not live, for a provider other than Anthropic. */
export function apiConnectReason(provider: ApiProvider, draft: string, looksRight: boolean, baseOk: boolean): string | null {
  if (provider === "compatible" && !baseOk) return "Enter the service's https address first.";
  if (looksRight) return null;
  if (draft.trim() === "") return "Paste a key first.";
  return `Paste a whole ${API_LABEL[provider]} key first.`;
}
