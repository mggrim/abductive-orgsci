/**
 * One passage of the researcher's material, drawn once for both readers (M46).
 *
 * The rendering lived inline in `CorpusMaterial.tsx`, which was fine while the
 * Material tab was the only surface that showed a passage. M46 puts the
 * passages a claim cites beside the claims table on Your model, and the brief's
 * instruction is to reuse this rendering rather than write a second one: two
 * renderings of a passage are two places for the opened mark, the cited mark and
 * the measure on the text to come apart.
 *
 * So the markup moved here unchanged, and `CorpusMaterial` renders this. What
 * the element is and what it carries are both load-bearing and neither is this
 * component's choice:
 *
 *   - `<details class="chunk" data-chunk-id>` is what `attachChunkObservers`
 *     matches, and it listens for `toggle` in the capture phase. A passage drawn
 *     as anything else records no attention at all, which is the defect
 *     CorpusMaterial's own header describes: the surface said "which passages you
 *     open is recorded" over markup that fired no toggle.
 *   - `data-opened` and `data-cited` carry the two states as attributes, because
 *     material.css marks an opened passage on its left edge and no state in this
 *     app is ever hue alone. The chips carry the same two states as words.
 *
 * `startOpen` is the one thing Your model's pane asks for that the Material tab
 * does not. On Material a passage is a row in a list of nine and the fold is what
 * makes the list scannable; in the pane there are as many passages as the claim
 * cites, usually two or three, and the owner's ask was to see the material rather
 * than to go looking for it. React writes `open` only when the prop changes, so a
 * reader can still close a passage the pane opened.
 *
 * What the pane frames around this, rather than inside it: the document's name
 * and kind, and the way over to the same passage on Material. Those are facts
 * about where a passage sits in the study, which the Material tab already states
 * on the document row this fold is nested inside. See `ClaimMaterial.tsx`.
 */

import type { Chunk } from "../state/chunks.ts";
import { StatusChip } from "../ui/components/index.ts";
import { passageElementId } from "../ui/routes.ts";

/*
 * 80 rather than 96, which is the measure bar the rest of the app is held to.
 * A preview is one clipped line and the box ellipsises it anyway, so the count
 * was invisible until the row was measured: at 611px and 13px the preview line
 * fitted 97 characters, the widest run of text on the surface, on the one
 * element whose job is to be scanned rather than read.
 */
export const PREVIEW_CHARS = 80;

/** The one line of a passage a reader sees before deciding to open it. */
export function firstLine(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS)}…` : flat;
}

/**
 * What a screen reader says when it lands on a passage: its number, its state,
 * then the line itself. Moved here with the markup that carries it.
 */
export function passageRowLabel(
  index: number,
  preview: string,
  state: { readonly opened: boolean; readonly cited: boolean },
): string {
  const marks = [state.opened ? "opened" : null, state.cited ? "cited" : null].filter(
    (m): m is string => m !== null,
  );
  const head = marks.length === 0 ? `Passage ${index}` : `Passage ${index}, ${marks.join(" and ")}`;
  return `${head}. ${preview}`;
}

export function Passage(props: {
  chunk: Pick<Chunk, "id" | "index" | "text">;
  /** On the record as opened, off the ledger rather than off component state. */
  opened: boolean;
  /** Cited by a live claim in the model. */
  cited: boolean;
  /** Drawn already open, which Your model's pane asks for and Material does not. */
  startOpen?: boolean;
}) {
  const { chunk, opened, cited, startOpen } = props;
  return (
    <details
      /* The id the passage link in Your model's pane scrolls to, written here so
         the route and the element cannot spell it two ways. One route renders at a
         time, so this is unique on the page wherever a passage is drawn. */
      id={passageElementId(chunk.id)}
      className="chunk"
      data-chunk-id={chunk.id}
      data-opened={opened}
      data-cited={cited}
      {...(startOpen === true ? { open: true } : {})}
    >
      <summary
        aria-label={passageRowLabel(chunk.index + 1, firstLine(chunk.text), { opened, cited })}
      >
        <span className="chunk-index">#{chunk.index + 1}</span>
        <span className="chunk-preview">{firstLine(chunk.text)}</span>
        {/* Both states carry their word. The left edge repeats "opened" as a hue
            so the list can be scanned down rather than read across, and no state
            in this app is ever hue alone. */}
        {opened && <StatusChip label="opened" tone="accent" />}
        {cited && <StatusChip label="cited" tone="accent" />}
      </summary>
      <div className="chunktext">{chunk.text}</div>
    </details>
  );
}
