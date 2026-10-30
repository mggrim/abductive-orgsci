/**
 * Model extraction from uploads into the staging tray (ISC-54, ISC-57).
 *
 * The anti-criterion is the important one: no path from reading a document to
 * writing the ontology. That is enforced by the return type. `extractProposals`
 * resolves to `readonly ProposalEvent[]`, and a `ProposalEvent` cannot express
 * a mutation — there is no `op`, no `origin`, nothing the ontology projection
 * reads. A caller that wanted to skip adjudication would have to construct a
 * different event type by hand, which is visible in review and caught by the
 * grep probe on this directory.
 *
 * Origin is stamped at adjudication rather than here, because what matters for
 * the colonization measurement is not that a model said something but that a
 * human took it in. What the draft carries is which origin that accept should
 * stamp, and for a claim read out of the researcher's own material that is
 * `data-driven` (D30, M43c): the page holds what the documents say, the same
 * ground on which the paper reader's drafts carry `literature-derived`. A draft
 * that cited nothing carries no stamp and stays the model's.
 */

import type { LedgerEvent, PageType, ProposalEvent } from "../ledger/events.ts";
import { PAGE_TYPES } from "../ledger/events.ts";
import type { InferenceClient } from "../inference/types.ts";
import { MODEL_VOICE_RULES } from "../inference/promptMarkers.ts";
import type { AttentionEvent } from "../ledger/events.ts";
import { dataOnly } from "../state/chunks.ts";
import type { Chunk } from "../state/chunks.ts";
import { extractCitations } from "../personas/engine.ts";
import { providerField } from "../inference/types.ts";
import { OWNER_RULES } from "../personas/voice.ts";
import { completeInVoice, voiceRetryField } from "../inference/voiceRetry.ts";

const EXTRACTION_SYSTEM = [
  MODEL_VOICE_RULES,
  "",
  /* M69, ISC-644: the owner's rules, which the proposal bodies a researcher reads must keep. */
  OWNER_RULES,
  "",
  "# Role",
  "You are considering a researcher's raw material and proposing candidate elements for their study's evolving ontology. You are proposing, not deciding. Everything you produce goes to a staging tray the researcher adjudicates one by one.",
  "",
  "## What to propose",
  "Propose only what the material itself supports. Do not propose a construct because it would make the account tidier, and do not propose the obvious theoretical label for a phenomenon when the material is more specific than the label.",
  "",
  "Page types available:",
  "- puzzle: something happening that every account leaves unexplained so far",
  "- candidate-resolution: a proposed explanation, including any account you draw out of this material",
  "- observation: a specific thing in the material",
  "- analytic-residue: material that resists the current account",
  "- rival: a competing explanation",
  "- scope-condition: a boundary on where an account holds",
  "",
  "Do not propose a theory page. A theory page holds an expectation somebody already published, which a study can then break, and nothing in this material is that: an account you draw out of the researcher's own data is their explanation of it, so propose candidate-resolution instead. Abductive files anything that you send as theory as a candidate resolution.",
  "",
  "Propose analytic-residue generously. Material that does not fit is the most useful thing you can surface and the easiest to leave out.",
  "",
  "## Output format, strictly",
  "One proposal per block, blocks separated by a line containing only '---'. Each block:",
  "TYPE: <one of the page types above>",
  "TITLE: <short noun phrase, under twelve words>",
  "COMPETES: <on a rival only, and only when one of the explanations listed below is the one it competes with. Copy that explanation's title exactly. Leave the line out otherwise.>",
  "BODY: <two to four sentences. Say what it is and what in the material supports it.>",
  "",
  "Cite the material inline in BODY as [[chunk:ID]] using the exact ids given. A proposal that cites nothing is ungrounded, so cite or do not propose.",
].join("\n");

export interface ExtractionInput {
  readonly projectId: string;
  readonly chunks: readonly Chunk[];
  /** Titles of pages already in the ontology, so the model does not re-propose them. */
  readonly existingTitles?: readonly string[];
  /**
   * The explanations already in the model, so a rival can name the one it
   * competes with (D34, M43c).
   *
   * A rival's whole content is that it competes with a particular account, and a
   * rival drafted here arrived competing with nothing: only the ones made by "Add
   * a rival" carried a link, so the rivals panel reported the absence of a rival
   * sitting in the same model. The link is drawn on accept, from the title the
   * model copied, and only when that title is one of these.
   *
   * Optional, so a caller with no graph to hand gets the behaviour it had. Absent,
   * no rival names anything and the researcher attaches it from the panel.
   */
  readonly explanations?: readonly { readonly id: string; readonly title: string }[];
  readonly now?: () => number;
  readonly makeId?: () => string;
}

export interface ExtractionResult {
  /** Staged candidates. Nothing here has touched the ontology. */
  readonly proposals: readonly ProposalEvent[];
  /** Retrieval attention for every chunk placed in context, and citation attention for those cited. */
  readonly attention: readonly AttentionEvent[];
  /** Append order: retrieval attention, proposals, citation attention. */
  readonly events: readonly LedgerEvent[];
}

/**
 * What a page type read out of the researcher's own material may be (walk 2).
 *
 * The data reader drafted theory pages: "Decaying authority of secondhand
 * description", "Handover line as operational instruction, not diagnosis". Both
 * are readings of a ward transcript, and both were then offered by the
 * expectation chooser as the expectation the researcher's puzzle broke.
 *
 * An expectation a puzzle breaks is a claim somebody else already made, in a
 * paper or in the researcher's own stated prior. An account drawn from the
 * data is the researcher's explanation of the thing they are puzzled by, which
 * is a candidate resolution. Offering it as the expectation makes the study
 * break its own reading of its own material and call the result a contribution.
 *
 * The prompt says so and this says so again, because a prompt is a request. A
 * model that returns TYPE: theory once in fifty runs would otherwise put one
 * of these back in the chooser, and nothing downstream could tell it from a
 * paper's expectation.
 */
export function dataPageType(proposed: PageType): PageType {
  return proposed === "theory" ? "candidate-resolution" : proposed;
}

/**
 * The explanation a rival named, resolved to a page, or undefined (D34, M43c).
 *
 * Rivals only: a `COMPETES:` line on any other page type is the model answering a
 * question it was not asked, and a `rivals` edge out of an observation would be
 * the tool asserting a relation nobody chose. Matched on the trimmed title,
 * case-insensitively, because the model is asked to copy a title and a copy that
 * differs in case is still unambiguously that title. A title matching nothing
 * draws no link, and the researcher attaches it from the rivals panel instead.
 */
function competesWith(
  parsed: ParsedProposal,
  explanations: readonly { readonly id: string; readonly title: string }[],
): string | undefined {
  if (parsed.pageType !== "rival" || parsed.competes === undefined) return undefined;
  const wanted = parsed.competes.trim().toLowerCase();
  return explanations.find((e) => e.title.trim().toLowerCase() === wanted)?.id;
}

interface ParsedProposal {
  readonly pageType: PageType;
  readonly title: string;
  readonly body: string;
  /**
   * The explanation a rival says it competes with, as the model wrote it (D34).
   *
   * A title rather than an id, because the model is given titles and never sees
   * an id. Resolving it to a page is the caller's job and it fails closed: a
   * title that matches nothing in the model draws no link.
   */
  readonly competes?: string;
}

/**
 * Where a BODY ends (M29b).
 *
 * It ended at the first line break, and silently. The terminator was `$` under
 * the `m` flag, which matches at every line end rather than at the end of the
 * string, and the quantifier before it is lazy, so `[\s\S]+?` stopped at the
 * first newline and the `TYPE|TITLE` half of the alternation almost never got a
 * chance to fire. A body written across three lines arrived as its first line.
 *
 * That was not cosmetic. The theory reader's body is specified as three parts
 * in order, the third being the passage cited as `[[chunk:ID]]`, so a model
 * that formatted them as three lines lost the scope line and the citation.
 * `extractCitations` then found nothing, `sourceChunks` came back empty, and a
 * claim drawn from an uploaded paper was flagged as citing no material, which
 * is the tool reporting its own parse loss as a defect in the researcher's work.
 * Every generator shared it: `extract.ts`, `glean.ts`, `rival.ts`, `theory.ts`.
 *
 * `$(?![\r\n])` is the fix. `$` still offers a position before every newline,
 * and the lookahead rejects all of them, so the only surviving match is the true
 * end of the string. `\r\n` is covered: `$` sits between the two characters and
 * the lookahead sees the `\n`. The anchor keeps `m`, because `BODY:` is never
 * the first line of a block.
 *
 * `[ \t]` rather than `\s` around the label, so the horizontal run cannot eat a
 * newline and start the body a line early.
 */
const BODY_RE = /^[ \t]*BODY:[ \t]*([\s\S]+?)(?=\n[ \t]*(?:TYPE|TITLE|COMPETES):|$(?![\r\n]))/im;

/** Parse the model's blocks. Malformed blocks are dropped, not guessed at. */
export function parseProposalBlocks(text: string): readonly ParsedProposal[] {
  const out: ParsedProposal[] = [];
  for (const block of text.split(/\n\s*---\s*\n/)) {
    const type = /^\s*TYPE:\s*(.+)$/im.exec(block)?.[1]?.trim().toLowerCase();
    const title = /^\s*TITLE:\s*(.+)$/im.exec(block)?.[1]?.trim();
    const body = BODY_RE.exec(block)?.[1]?.trim();
    /* D34 (M43c). Optional, and read for every block rather than for rivals only,
     * because this parser is shared by four generators and a field it silently
     * dropped for three of them would be a fifth place for the same defect. The
     * generators that do not ask for it never see it set. */
    const competes = /^\s*COMPETES:\s*(.+)$/im.exec(block)?.[1]?.trim();
    if (type === undefined || title === undefined || body === undefined) continue;
    if (title === "" || body === "") continue;
    if (!(PAGE_TYPES as readonly string[]).includes(type)) continue;
    out.push({
      pageType: type as PageType,
      title,
      body,
      ...(competes === undefined || competes === "" ? {} : { competes }),
    });
  }
  return out;
}

/**
 * Read the supplied chunks and stage candidate ontology elements.
 * Writes nothing; returns events for the caller to append.
 */
export async function extractProposals(
  input: ExtractionInput,
  client: InferenceClient,
): Promise<ExtractionResult> {
  const now = input.now ?? (() => Date.now());
  const makeId = input.makeId ?? (() => crypto.randomUUID());
  const { projectId } = input;
  /*
   * The papers are read, not mined (D5).
   *
   * Extraction proposes pages the researcher's claims will cite, so a candidate
   * lifted out of a journal editorial is a claim grounded in someone else's
   * argument wearing the clothes of evidence. Filtering here rather than at the
   * caller is deliberate: this is the boundary the anti-criterion is stated at,
   * and a second caller that forgot the filter would be a silent hole rather
   * than a visible one.
   *
   * Retrieval attention follows the filter. An attention event says the tool
   * put a passage in front of a model, and it did not put these in front of
   * this one.
   */
  const chunks = dataOnly(input.chunks);

  const retrieval: AttentionEvent[] = chunks.map((chunk) => ({
    id: makeId(),
    ts: now(),
    actor: "system",
    projectId,
    type: "attention",
    layer: "retrieval",
    chunkId: chunk.id,
  }));

  if (chunks.length === 0) {
    return { proposals: [], attention: retrieval, events: retrieval };
  }

  const existing =
    input.existingTitles === undefined || input.existingTitles.length === 0
      ? "(the ontology is empty)"
      : input.existingTitles.map((t) => `- ${t}`).join("\n");

  const explanations = input.explanations ?? [];
  const userMessage = [
    "# Already in the ontology, do not re-propose these",
    existing,
    "",
    /* The explanations a rival may name, by their exact titles (D34, M43c).
     * Listed separately from the block above even though every one of them is in
     * it, because that block is an instruction not to repeat them and this one is
     * an instruction to copy one. */
    "# Explanations already in the model, for a rival's COMPETES line",
    explanations.length === 0
      ? "(none yet, so leave COMPETES out)"
      : explanations.map((e) => `- ${e.title}`).join("\n"),
    "",
    "# Material",
    ...chunks.map((c) => `[[chunk:${c.id}]] (${c.kind}, #${c.index})\n${c.text}`),
  ].join("\n");

  const result = await completeInVoice(client, {
    system: EXTRACTION_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });

  const parsed = parseProposalBlocks(result.text);
  const proposals: ProposalEvent[] = [];
  const citation: AttentionEvent[] = [];

  for (const p of parsed) {
    const cited = extractCitations(p.body);
    const rivalOf = competesWith(p, explanations);
    proposals.push({
      id: makeId(),
      ts: now(),
      actor: `persona:extractor`,
      projectId,
      model: result.model,
      modelVersion: result.modelVersion,
      ...providerField(result),
      ...voiceRetryField(result),
      type: "proposal",
      proposalId: makeId(),
      pageType: dataPageType(p.pageType),
      title: p.title,
      body: p.body,
      /* D30 (M43c). Only where the draft cites a passage, which is the stamp's
       * whole warrant; `validateEvent` refuses it without one. Every chunk this
       * reader was given is a data document, because `dataOnly` filtered the
       * papers out above, so a citation here is a citation of the researcher's
       * own material by construction. */
      ...(cited.length === 0 ? {} : { originOnAccept: "data-driven" as const }),
      /* D34 (M43c). Drawn the moment the researcher accepts, from the page the
       * accept mints, exactly as `rival.ts` does it for a rival made on request.
       * A rival that competes with nothing is not a rival. */
      ...(rivalOf === undefined ? {} : { linkOnAccept: { to: rivalOf, role: "rivals" as const } }),
      sourceChunks: cited,
    });
    for (const chunkId of cited) {
      citation.push({
        id: makeId(),
        ts: now(),
        actor: `persona:extractor`,
        projectId,
        model: result.model,
        modelVersion: result.modelVersion,
        ...providerField(result),
        type: "attention",
        layer: "citation",
        chunkId,
      });
    }
  }

  return {
    proposals,
    attention: [...retrieval, ...citation],
    events: [...retrieval, ...proposals, ...citation],
  };
}
