/**
 * The headings a prompt carries so a client can tell what it was asked for.
 *
 * A leaf module with no imports, and that is the whole reason it exists.
 * `MockInferenceClient` has to answer a conversation turn with a conversation
 * turn and a draft with a draft, so it needs to read the shape of the request;
 * importing the prompt assembler to get at its headings would point
 * `src/inference` at `src/interview`, which imports `src/inference` back.
 *
 * These are model-facing headings rather than anything a researcher reads, so
 * they live under `src/inference`, which the prose scan classifies as not
 * user-facing for exactly that reason.
 */

/** Marks a system prompt asking for one turn of a conversation at a place. */
export const CONVERSATION_MARKER = "## Conversation rules";

/** Marks a system prompt asking for a draft made of the researcher's words. */
export const DRAFT_MARKER = "## Draft rules";

/**
 * Marks a system prompt asking the tool to read the puzzle out of saved answers
 * (M40).
 *
 * The framing's two-part draft marker was retired with the puzzle field: the
 * framing asks one question now and takes the ordinary draft.
 */
export const PUZZLE_READING_MARKER = "## Reading rules";

/**
 * The mechanical half of the copy standard, for the model (M42).
 *
 * Most of what a researcher reads is written by the model rather than by a
 * string in this repo: the questions at each step, the puzzle as the tool reads
 * it, the drafts, the check findings. `docs/copy-standard.md` part 4 is what
 * this block implements. Only the parts a machine can check are stated, and they
 * are stated once: a rule repeated in six prompt builders is a rule that drifts
 * in five of them.
 *
 * It lives here, beside the markers, because this module is a leaf with no
 * imports and every prompt builder can reach it without pointing `src/inference`
 * at `src/interview` or `src/lint`. `personas/voice.ts` carries it inside
 * `PROSE_CONTRACT`, which the interview, the conversation, the personas, the
 * coherence judge, the glean pass and the rival writer already include; the five
 * prompts that carry no prose contract append it themselves.
 *
 * What it does not do is tell the model what to ask or how to judge. Those are
 * the prompts' own words, and rewording them is a methodological change rather
 * than a copy edit, which is why the standard's scope list leaves prompt text
 * out.
 */
export const MODEL_VOICE_RULES = [
  "## How to write (copy standard)",
  "- Address the researcher as \"you\", and write about their study in the second person. Do not write \"they\", \"the researcher\" or \"their puzzle\": every sentence you write is read by the person it is about.",
  "- Name the thing rather than writing \"it\" or \"this\": say \"your puzzle\", \"your Site answer\", \"the passage from ward-notes.txt\". Name the step, name the paper, name the tab.",
  /* M48. The naming rule above shipped at M42 and the owner still read \"holds it
   * up\", \"pushes against it\" and \"So many uses of the words 'it' 'them'
   * 'what'\" off the screen on 2026-09-13. The rule as written is satisfied by a
   * sentence whose noun sits in the sentence before, which is exactly the shape
   * that failed: a reader meeting one sentence on a card, a chip or a key has no
   * earlier sentence. So the scope is stated, in the same terms
   * `tests/copyBarScan.ts` now checks the repo's own strings against. */
  "- Use a pronoun only when the noun it stands for is earlier in the same sentence. If that noun is in the sentence before, write the noun again: \"the claim\", \"the paper\", \"that expectation\". This applies to \"it\", \"its\", \"them\", \"they\", \"this\", \"that\", \"these\", \"those\", \"what\" and \"which\".",
  "- Do not write \"here\" or \"there\" for a place. Name the place: \"at the Site step\", \"on the Sources tab\", \"in your material\", \"on this drawing\".",
  "- Use contractions where a person would: \"you're\", \"it's\", \"doesn't\", \"isn't\", \"can't\".",
  "- Do not use em dashes or en dashes. Use a comma, a full stop, or a new sentence.",
  "- Do not write \"It's not X. It's Y.\", and do not use the \"X, not Y\" reframe.",
  "- Do not write three-item lists for rhythm, or one-word sentences.",
  /* M95c: the owner, 2026-10-30: "don't use the word 'card' to refer to stuff in the tool". */
  '- Do not use the word "card" for anything in Abductive. Name the thing: the concept, the relation, the accepted concept or relation, the Why it matters line, the step or the page.',
].join("\n");
