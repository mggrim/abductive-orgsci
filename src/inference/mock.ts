/**
 * Deterministic mock inference client for tests and offline development.
 *
 * Returns canned persona-style responses that cite chunks in the
 * [[chunk:ID]] format the persona engine parses (ISC-14, ISC-23).
 * Supports scripted responses (consumed in order) and records every request
 * so tests can assert on prompt assembly (creed injection, question sets).
 */

import type {
  CompleteRequest,
  CompleteResult,
  InferenceClient,
} from "./types.ts";
import { applyVoiceGate } from "./voiceGate.ts";
import {
  CONVERSATION_MARKER,
  DRAFT_MARKER,
  PUZZLE_READING_MARKER,
} from "./promptMarkers.ts";

export interface MockOptions {
  /** Scripted response texts, consumed in call order. */
  readonly responses?: readonly string[];
  readonly model?: string;
  readonly modelVersion?: string;
}

const CHUNK_ID_RE = /\[+chunk:([^\]\s]+)\]+/;

/**
 * The canned conversation turn (M37).
 *
 * It has to be a *valid* turn, not just text: a reply ending on a question and
 * the two marked lines the parser reads, or every conversation test would be
 * exercising the fallback path instead of the one that ships. Still identical
 * whatever you ask, which is the property that gives the mock away and the
 * reason the offline banner exists.
 */
const MOCK_CONVERSATION = [
  "That is the part that I want to stay with for a moment.",
  "",
  "What did you see that made you say it?",
  "",
  "QUESTION: What did you see that made you say it?",
  "BECAUSE: You have named the thing but not yet what it looked like.",
].join("\n");

/** The canned draft. First person, short, and made of nothing at all. */
const MOCK_DRAFT = "I am looking at [...] and what caught me was [...].";

/**
 * The canned reading (M40).
 *
 * A `NONE:` rather than a puzzle, and made of nothing, for the reason the draft
 * above is: the mock must not put a sentence about the researcher's own study in
 * front of them, and the honest answer to "read the puzzle out of what is saved"
 * when nothing has been read is that a half is missing.
 */
const MOCK_PUZZLE_READING =
  "NONE: You haven't saved an answer that says what you expected, so your puzzle is missing the expectation that it cuts against.";

/** Build a deterministic default response citing the first chunk id found in the request. */
function defaultResponse(req: CompleteRequest): string {
  const system = req.system;
  if (system.includes(PUZZLE_READING_MARKER)) return MOCK_PUZZLE_READING;
  if (system.includes(DRAFT_MARKER)) return MOCK_DRAFT;
  if (system.includes(CONVERSATION_MARKER)) return MOCK_CONVERSATION;
  const haystack = req.messages.map((m) => m.content).join("\n");
  const match = CHUNK_ID_RE.exec(haystack);
  const chunkId = match?.[1];
  const citation = chunkId === undefined ? "" : ` The excerpt [[chunk:${chunkId}]] is the sharpest instance of this problem.`;
  return (
    "The stated design bounds its answer before the field has spoken: the comparison is " +
    "justified by difference, and the design leaves its focal contrast unnamed." +
    citation +
    " Name the single dimension of theoretical interest, or the contrast is uninterpretable."
  );
}

export class MockInferenceClient implements InferenceClient {
  readonly requests: CompleteRequest[] = [];
  get requestedModel(): string {
    return this.#model;
  }
  #queue: string[];
  #model: string;
  #modelVersion: string;

  constructor(options: MockOptions = {}) {
    this.#queue = [...(options.responses ?? [])];
    this.#model = options.model ?? "mock";
    this.#modelVersion = options.modelVersion ?? "mock-2026-01";
  }

  complete(req: CompleteRequest): Promise<CompleteResult> {
    this.requests.push(req);
    const scripted = this.#queue.shift();
    const text = scripted ?? defaultResponse(req);
    // The mock is a door too. It is the one every test and every offline
    // session comes through, so leaving it ungated would have meant the rule
    // held in production and not in the environment the tool is developed in,
    // which is how FND-01 stayed invisible for as long as it did.
    return Promise.resolve(
      applyVoiceGate({
        text,
        model: this.#model,
        modelVersion: this.#modelVersion,
      }),
    );
  }

  /**
   * Word-by-word so offline development exercises the same streaming path the
   * bridge uses. Deltas are delivered synchronously within the promise, which
   * keeps tests deterministic — a mock that used timers would make every
   * streaming assertion a race.
   */
  async completeStream(
    req: CompleteRequest,
    onDelta: (delta: { text: string }) => void,
  ): Promise<CompleteResult> {
    const result = await this.complete(req);
    for (const word of result.text.split(/(\s+)/)) {
      // M58: a stop between words ends the stream the way a fetch abort does.
      if (req.signal?.aborted === true) throw new DOMException("You stopped the reply.", "AbortError");
      if (word !== "") onDelta({ text: word });
    }
    return result;
  }
}
