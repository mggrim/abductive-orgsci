/**
 * Coverage map (ISC-25): per-document chunk grid with the three attention
 * overlays (retrieval / citation / human) individually toggleable. Unattended
 * chunks — no attention at ANY layer — render visually distinct regardless of
 * which overlays are on. Derives entirely from the ledger events (via props
 * from useLedger upstream) + chunk store reads through the pure
 * `projectCoverage` projection. Overlay toggles are ephemeral UI state
 * (allowed, ISC-29).
 */

import { useState } from "react";
import type { AttentionLayer, LedgerEvent } from "../ledger/events.ts";
import type { Chunk, StoredDocument } from "../state/chunks.ts";
import { projectCoverage } from "./coverageModel.ts";
import { EmptyState } from "../ui/components/index.ts";
import { PASSAGE_WORD, passageAt, passageCount } from "../ui/materialVocabulary.ts";

/**
 * Three layers, and the label is what the layer means rather than what it is
 * called internally.
 *
 * The two long parentheticals rendered as one 640px line inside a 395px track
 * and wrapped to three, so the legend was taller than the grid it explained,
 * and the third read "Human" over a note reading "human layer = engagement
 * proxy (expand/dwell)": a definition written in the shape of an assignment
 * statement, with a slug on both sides of an equals sign.
 */
/*
 * M42. The three keys read "Retrieval", "Citation" and "You" with the plain
 * words in an <em> beside them. "Retrieval" and "Citation" are the tool's own
 * names for the layers, and the copy bar bans both as nominalisations, so the
 * plain words are the labels now and the note says the same thing once. The
 * layer ids are unchanged: they are what the record stores.
 */
const LAYERS: readonly { id: AttentionLayer; label: string; note: string }[] = [
  { id: "retrieval", label: "Abductive read the passage", note: "the passage went into the model's context" },
  { id: "citation", label: "A check quoted the passage", note: "the passage appears in a bias check's flag" },
  { id: "human", label: "You read the passage", note: "you opened the passage or stayed on it" },
];

export function CoverageMap(props: {
  events: readonly LedgerEvent[];
  chunks: readonly Chunk[];
  documents: readonly StoredDocument[];
}) {
  const [enabled, setEnabled] = useState<Record<AttentionLayer, boolean>>({
    retrieval: true,
    citation: true,
    human: true,
  });

  const summary = projectCoverage(props.events, props.chunks, props.documents);

  function cellClass(layers: Readonly<Record<AttentionLayer, boolean>>, unattended: boolean): string {
    if (unattended) return "covcell unattended";
    const on = (["retrieval", "citation", "human"] as const).filter(
      (layer) => enabled[layer] && layers[layer],
    );
    return on.length === 0 ? "covcell off" : `covcell ${on.map((l) => `cov-${l}`).join(" ")}`;
  }

  return (
    <section className="card">
      {/* Was "Coverage map", under a panel heading reading "Attention across
          the corpus": two titles for one figure. The panel dropped its heading
          and this one took the words, so the figure is named once. */}
      <h2>Coverage of sources</h2>
      <p className="small muted">
        {passageCount(summary.totalChunks)} of your sources, {summary.unattendedChunks} of them
        still unread. Untick a layer to compare where the other two went.
      </p>

      <div className="covlegend">
        {LAYERS.map(({ id, label, note }) => (
          <label key={id} className={`covkey cov-${id}`}>
            <input
              type="checkbox"
              className="tickbox"
              checked={enabled[id]}
              onChange={() => setEnabled((prev) => ({ ...prev, [id]: !prev[id] }))}
            />
            {/* The name and its gloss are one flex item now. They were two: a
                bare text node and an <em>, inside a `.covkey` that is
                display:flex with a 4px gap, so the gap opened between the word
                and the comma that belongs to it and all three keys rendered
                "Retrieval , went into the model's context". */}
            <span className="covkey-name">
              {label}
              <em className="muted">, {note}</em>
            </span>
          </label>
        ))}
        {/* Was `<span className="covkey unattended">`, which put the dashed
            outline round the words rather than round a swatch, so the one key
            that matters most read as a broken input beside three checkboxes.
            The mark is the same cell the grid draws. */}
        <span className="covkey">
          <span className="covcell unattended" aria-hidden="true" />
          Passage still unread
        </span>
      </div>

      {/* Was a bare sentence in no container, which is the shape FND-09 counted
          on four surfaces and this component was the fourth. */}
      {summary.documents.length === 0 && (
        <EmptyState
          status="You haven't added any sources to this project yet."
          // M28 r6: copy. 33 words, and "the corpus" where the product says
          // "your material".
          teach={`One square per ${PASSAGE_WORD} of your sources, darkening as each layer reaches it. The squares that stay pale are the parts still unread.`}
          testId="coverage-empty"
        />
      )}

      {summary.documents.map((doc) => (
        <div key={doc.documentId} className="covdoc">
          <h3>{doc.documentName}</h3>
          <div className="covgrid">
            {doc.chunks.map((chunk) => (
              <span
                key={chunk.chunkId}
                className={cellClass(chunk.layers, chunk.unattended)}
                data-chunk-id={chunk.chunkId}
                title={
                  `${passageAt(chunk.index)} (${chunk.chunkId.slice(0, 8)})\n` +
                  /* M42. The tooltip printed the three layer ids and a
                     parenthesised "(proxy)": "retrieval: yes · citation: no ·
                     human (proxy): no". The ids are what the record stores and
                     the legend above says what each layer means, so the tooltip
                     says the same three things in the same words. */
                  `Abductive read the passage: ${chunk.layers.retrieval ? "yes" : "no"} · ` +
                  `A check quoted the passage: ${chunk.layers.citation ? "yes" : "no"} · ` +
                  `You read the passage: ${chunk.layers.human ? "yes" : "no"}\n` +
                  chunk.preview
                }
              >
                {/* The cell is 10px square and the index was rendered into it
                    as visible text, so a two-digit chunk overflowed its own
                    box and a three-digit one overflowed the cell beside it. A
                    corpus grid is read as a shape; the number is what a screen
                    reader and the title need, not what the eye needs. */}
                <span className="visually-hidden">{chunk.index}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
