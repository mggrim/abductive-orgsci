/**
 * The material, permanently mounted (ISC-24 carried forward).
 *
 * This sits in the always-visible column rather than inside the early-data
 * station, and the reason is the human attention layer. `useHumanAttention`
 * observes the chunk list; if the list only mounted when the researcher stood
 * at station eight, the tool would record attention on the corpus only while
 * they were at station eight, and rereading a transcript while thinking about
 * the tension is exactly the attention worth capturing.
 *
 * The callback ref is a hard-won detail carried from v1: the entire human
 * attention layer was silently dead in dev for weeks because a cleanup effect
 * detached the observers and StrictMode never re-ran the callback ref to
 * reattach them. The ref goes on a container that nothing unmounts.
 *
 * Two defects this round, both of them the same shape: the surface claimed
 * something the markup did not do.
 *
 * The first. `attachChunkObservers` matches `details.chunk[data-chunk-id]` and
 * listens for `toggle`. This file rendered each passage as
 * `<li class="chunk" data-chunk-id>`, which fires no toggle and matches no
 * selector, so the whole human attention layer recorded nothing from the one
 * surface built to feed it, while the page lede above it said "which passages
 * you open is recorded". material.css still carried a `details.chunk` rule and
 * a `.chunktext` rule that nothing on the route rendered, which is the fossil
 * of the correct markup. Passages are `<details>` again.
 *
 * The second. /material is the tab called Material and it had no way to add
 * any: it told the researcher to go to the Early data station, one tab over,
 * behind a station sequence. Upload lives here as well now. Extraction does
 * not, and that split is deliberate. Adding a file writes only to local
 * storage; reading the corpus for candidates spends a model call, and a model
 * call belongs to the station that explains what it is about to do.
 *
 * D5 makes this section one of two rather than one of a pair of columns. It is
 * "Your data", and the papers the researcher is arguing with are the section
 * above it. The component is handed the data documents only; literature is the
 * other section's, and reaches this one only when a researcher retags a row.
 *
 * The kind select lost its default in the same pass, and that is the whole
 * defect this page was carrying. It opened on "transcript", so a journal
 * editorial dropped here was filed as fieldwork and `uncited-chunk` then nagged
 * the researcher for failing to cite it as evidence. It opens on a placeholder
 * now and the picker beside it is inert until the researcher has said what the
 * file is. A default kind is a guess the tool has no standing to make.
 */

import { ReadDataControl } from "./EarlyDataControls.tsx";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useHumanAttention } from "../attention/useHumanAttention.ts";
import type { LedgerEvent } from "../ledger/events.ts";
import { useLedger } from "../state/ledgerContext.tsx";
import {
  DATA_DOCUMENT_KINDS,
  DOCUMENT_KINDS,
  documentCountNote,
  ingestFile,
  isPdfFile,
  type Chunk,
  type DocumentKind,
  type StoredDocument,
} from "../state/chunks.ts";
import { listChunks, saveChunks, saveDocument } from "../state/projects.ts";
import { announceHere } from "../state/useStudyFreshness.ts";
import {
  Disclosure,
  EmptyState,
  Field,
  InertNote,
  StatusChip,
  fieldAria,
  fieldHintId,
  inertAttrs,
  inertNoteId,
  // M32 R8. The document row is a `<details>`, so its box is the summary's and
  // what it takes from the primitive is the state class rather than the
  // component: `rowClass` is what the primitive exports for exactly that.
  rowClass,
} from "../ui/components/index.ts";
import { documentKindLabel } from "../ui/materialVocabulary.ts";
import { passageElementId, passageRequested } from "../ui/routes.ts";
import { Passage } from "./Passage.tsx";
import { RemoveDocument } from "./RemoveDocument.tsx";
import {
  CORPUS_SHOWS,
  CORPUS_SORTS,
  corpusView,
  corpusViewNote,
  type CorpusShow,
  type CorpusSort,
} from "./corpusView.ts";

/* The passage itself is drawn by `Passage.tsx` since M46, so that Your model's
 * pane and this tab cannot come apart about what a passage looks like. Its
 * label is re-exported below for the two tests that read it from here. */
export { passageRowLabel } from "./Passage.tsx";

/** Rough, and labelled rough. Whitespace runs, which is what a word count is. */
export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Which passages this study has on record as having been opened.
 *
 * Read off the ledger rather than off component state, for the same reason
 * everything else here is: an opened passage is a recorded fact about the
 * study, not a fact about this mount of this page. Both attention kinds count,
 * because the distinction between expanding a passage and dwelling on it is a
 * distinction about strength of the proxy, and neither one is "unread".
 */
export function openedChunkIds(
  events: readonly LedgerEvent[],
  projectId: string,
): ReadonlySet<string> {
  const seen = new Set<string>();
  for (const event of events) {
    if (event.type !== "attention" || event.projectId !== projectId) continue;
    seen.add(event.chunkId);
  }
  return seen;
}

/**
 * What a screen reader says when it lands on a document row.
 *
 * The computed name was the five chips run together with nothing between a
 * label and its number: "b-transcript.txtfieldnotepassages1words7opened1cited0".
 * Every fact on the row is worth hearing and none of them was audible. The file
 * name comes first so the spoken name still opens with the visible one.
 *
 * M49 (ISC-530): the four counts came off the row, so they come off the spoken
 * name with them. A screen reader hearing four numbers nobody can see would be
 * the row saying more to one reader than to another, which is the same defect
 * this function was written to fix, pointing the other way. What is left is the
 * file and what it is.
 */
export function documentRowLabel(name: string, facts: { readonly kind: string }): string {
  return `${name}, ${facts.kind}`;
}

/**
 * What the data upload is waiting on. Null once the researcher has said what
 * the file is, which is the one thing the tool cannot work out for them and the
 * one thing it used to guess.
 *
 * A condition, not an instruction: the sentence reports the state of the form,
 * the way every other sentence under an inert control in this app does.
 *
 * R3, copy C6: it called the control a "picker", which is what this file calls
 * a file input and not what anybody else calls one. The copy critic's paste was
 * "Choose what this is first, then the file button goes live", which fixes the
 * word and turns the sentence into an instruction, and the rule against that is
 * older and pinned in tests/literature-kind.test.ts. The word is fixed here and
 * the grammar is left alone.
 */
export function dataUploadReason(kind: DocumentKind | ""): string | null {
  return kind === "" ? "Choose a file type first." : null;
}

export function CorpusMaterial(props: {
  projectId: string;
  documents: readonly StoredDocument[];
  chunks: readonly Chunk[];
  /** Passages the live ontology already cites. The other half of "unused". */
  cited: ReadonlySet<string>;
  /** Called once material has landed in storage, so the page can reread it. */
  onAdded: () => void;
}) {
  const { projectId, documents, chunks, cited, onAdded: onAddedProp } = props;
  /*
   * Material landing in storage is a change to the study, said out loud (D21, M43b).
   *
   * `onAdded` re-reads the surface that mounts this one and reaches nothing else.
   * The framing dock is the shell's, mounted once per study and standing across
   * all five tabs, and it holds a corpus of its own for the puzzle reading and the
   * paper judge; a file added here never reached it, so its digest went on
   * describing the study as it was when the tab opened. The announcement is the
   * mechanism the framing save already uses, and every holder of this study listens
   * on it, so one call reaches all of them.
   */
  const onAdded = useCallback(() => {
    onAddedProp();
    announceHere(projectId);
  }, [onAddedProp, projectId]);
  const attentionRef = useHumanAttention(projectId);
  const { events } = useLedger();
  /*
   * Which folds are open, as the researcher's own answer per document rather
   * than as one id.
   *
   * It was `openDoc: string | null`, an accordion: opening the second document
   * closed the first. That is a reasonable default on a list of two and the
   * wrong one on a list of forty, where comparing two transcripts is the whole
   * job. `undefined` here means the researcher has not said, and the search
   * below answers for them.
   */
  const [toggled, setToggled] = useState<Readonly<Record<string, boolean>>>({});
  /*
   * The passage a link asked for, and the document it sits in (M46).
   *
   * Your model's side pane offers the way over to a cited passage here, and the
   * shell scrolls to the element by id. A passage behind two closed folds is not a
   * passage the researcher can see, so the document fold opens and the passage
   * opens, on the same reasoning as `row.hitInText` below: a hit the reader cannot
   * see is not a hit. Read from the hash at mount, so pressing a fold shut
   * afterwards is not argued with by a route that has not changed.
   */
  const askedPassage = useMemo(
    () => (typeof window === "undefined" ? null : passageRequested(window.location.hash)),
    [],
  );
  const askedDocument = useMemo(
    () => chunks.find((c) => c.id === askedPassage)?.documentId ?? null,
    [chunks, askedPassage],
  );
  /* And the scroll to it, owned here rather than by the shell's landing table.
   *
   * Every row in that table names a section its view renders on its first paint, so
   * the shell's one frame is enough. A passage is two async steps later: the corpus
   * has to come back from storage and the fold holding it has to open. Measured in
   * real Chrome, the shell's effect ran, found nothing, and the reader landed at the
   * top of a tab holding nine documents with the right one open somewhere below the
   * fold. This runs when the corpus is on screen, which is the only moment the
   * element exists, on the same reasoning `FRAMING_OPEN_EVENT` gives for the framing
   * band owning its own open-paint-scroll-focus sequence. */
  useEffect(() => {
    if (askedPassage === null || askedDocument === null) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(passageElementId(askedPassage))?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [askedPassage, askedDocument]);
  /*
   * The empty string is the placeholder, and it is a real state rather than a
   * sentinel standing in for one: the researcher has not said what this file
   * is. `transcript` sat here before, which is how `thorp.pdf` became a
   * transcript. See the module note.
   */
  const [kind, setKind] = useState<DocumentKind | "">("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<CorpusShow>("all");
  const [sort, setSort] = useState<CorpusSort>("added");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const opened = useMemo(() => openedChunkIds(events, projectId), [events, projectId]);
  const words = useMemo(
    () => chunks.reduce((sum, chunk) => sum + wordCount(chunk.text), 0),
    [chunks],
  );
  const openedHere = useMemo(
    () => chunks.filter((chunk) => opened.has(chunk.id)).length,
    [chunks, opened],
  );
  const citedHere = useMemo(
    () => chunks.filter((chunk) => cited.has(chunk.id)).length,
    [chunks, cited],
  );

  /*
   * The list and the counts printed beside it come from one call, because the
   * defect this pair was sent back for twice was a count beside a control
   * knowing better than the thing the control produced.
   */
  const view = useMemo(
    () =>
      corpusView({
        documents,
        chunks,
        opened,
        cited,
        query,
        show,
        sort,
        countWords: wordCount,
      }),
    [documents, chunks, opened, cited, query, show, sort],
  );

  /*
   * A new search is a new view, so the folds the previous one opened stop being
   * the researcher's answer. Without this, searching for a word, closing the
   * document it landed in and then searching for another word leaves that
   * document shut against a fresh hit.
   */
  useEffect(() => setToggled({}), [query, show]);

  const clearView = useCallback(() => {
    setQuery("");
    setShow("all");
    setSort("added");
    setToggled({});
  }, []);

  const onUpload = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files === null || files.length === 0) return;
      // The guard behind the inert picker. aria-disabled keeps the control in
      // the tab order, so the click still fires and the handler owns the stop.
      if (kind === "") {
        e.target.value = "";
        return;
      }
      setBusy("Reading files…");
      setError(null);
      const chosen = Array.from(files);
      try {
        let count = documents.length;
        for (const file of chosen) {
          let extractPdf: ((f: File) => Promise<string>) | undefined;
          if (isPdfFile(file.name)) {
            const pdf = await import("../state/pdf.ts");
            extractPdf = pdf.extractPdfText;
          }
          const result = await ingestFile({
            projectId,
            file,
            kind,
            existingDocumentCount: count,
            ...(extractPdf !== undefined ? { extractPdf } : {}),
          });
          await saveDocument(result.document);
          await saveChunks(result.chunks);
          count += 1;
          /*
           * Refreshed per file, not once after the loop.
           *
           * `onAdded()` sat after the `for`, so anything that threw part way
           * through a batch skipped the refresh for every file that had already
           * landed. Measured: 25 files dispatched at the picker, 19 committed to
           * storage, and one screenshot then read "1 document" in the lede,
           * "DOCUMENTS 1" in the chip and "1 of 20 documents so far" in the
           * hint, all of it beside an error about 20. Reloading showed 20. A
           * count on this page is a count of what is in storage, and a file that
           * is in storage has to be on the screen whatever happened to the file
           * after it.
           */
          onAdded();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
        e.target.value = "";
      }
    },
    [documents.length, kind, projectId, onAdded],
  );

  /*
   * Change a document's kind after the fact.
   *
   * The select beside the picker was write-once: pick "transcript" for a batch
   * that turned out to hold two fieldnotes and the label was permanent, on a
   * surface whose only other controls were a disclosure triangle and a file
   * input. Kind is a label on the material, not a fact about the ledger, so
   * changing it rewrites the document and its passages in storage and appends
   * nothing. Nothing that has been recorded about the study moves: attention
   * events point at chunk ids, and the ids do not change.
   */
  const retag = useCallback(
    async (doc: StoredDocument, next: DocumentKind) => {
      if (next === doc.kind) return;
      setError(null);
      try {
        await saveDocument({ ...doc, kind: next });
        const stored = await listChunks(projectId);
        await saveChunks(
          stored.filter((c) => c.documentId === doc.id).map((c) => ({ ...c, kind: next })),
        );
        onAdded();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [projectId, onAdded],
  );

  /* Which document's Remove has been armed, by id. One at a time, for the same
   * reason the study list arms one at a time. */
  const [arming, setArming] = useState<string | null>(null);

  const slotHint = `${documents.length} loaded. txt, md or pdf. Files stay in this browser.`;
  const sizeNote = documentCountNote(documents.length);
  const uploadReason = dataUploadReason(kind);

  return (
    <section className="material" data-testid="corpus-material">
      {/* The five chips went at M49 (ISC-530): DOCUMENTS, PASSAGES, WORDS,
          OPENED and CITED. A co-author, 2026-09-21: less is more on counts and
          secondary numbers. None of the five is a number a researcher decides
          anything by while they are adding material, and five of them across the
          head of the working tab is the surface reporting on itself. Every one of
          them is still on the record panel, in Your model's census and in the
          exports, which is where a reader who wants the tally goes. */}
      <div className="material-head">
        <h2>Data</h2>
      </div>
      {/* M62, ISC-600: The data lede moved into the page's Help control (ui/pageHelp.ts). */}

      {/* M74b, ISC-665: the read that Early data offers, here where the data is,
          so "I have early data" lands beside a control that reads it. */}
      <ReadDataControl projectId={projectId} chunks={chunks} onChanged={onAdded} />

      <div className="material-add" data-testid="material-add">
        {/* One Field, two controls. Two Fields side by side staggered their
            labels, because only one of them carried a hint and the hint sits
            between the label and the control: "Kind" rendered 11px below "Add
            material" and the row read as two unrelated blocks. The kind select
            names itself with aria-label rather than a second visible label. */}
        {/* M32c, fix 4. The label is the picker's face and the native control
            is behind it.
            
            `<input type="file">` renders two strings the browser owns, "Choose
            Files" and "No file chosen", and no CSS reaches either, so the one
            control on this screen where a researcher brings in their own
            transcripts spoke in the browser's voice beside a tokenised select.
            The label already pointed at the input, so clicking "Add your data"
            already opened the picker; what it needed was to look like the
            control it was. No string is added and none is duplicated.
            
            Nothing is lost by hiding the native text. `onUpload` reads the
            files on change, so the chosen names were on screen for the length
            of one frame; what a researcher actually reads afterwards is
            "Reading files…", then the rows, then the count in the hint. */}
        <Field
          label="Add data"
          htmlFor="material-upload"
          hint={slotHint}
          labelIsControl
          labelInert={uploadReason !== null}
        >
          <div className="material-add-row">
            {/* The placeholder is an option with no value, so nothing is chosen
                until the researcher chooses it. The four kinds here are the
                data kinds; a paper goes in the section above, and a file
                already loaded can be moved either way from its own row. */}
            <select
              value={kind}
              aria-label="File type"
              onChange={(e) => setKind(e.target.value as DocumentKind | "")}
              data-testid="material-kind"
            >
              <option value="">Choose type</option>
              {DATA_DOCUMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {documentKindLabel(k)}
                </option>
              ))}
            </select>
            {/* Clipped rather than `display: none` or `opacity: 0` on a
                stacked box: the researcher must still be able to reach the
                picker with a keyboard, and `.visually-hidden` keeps it in the
                tab order. The ring the eye needs then belongs to the face, and
                `.field-row:focus-within .field-face` draws it there. */}
            <input
              className="visually-hidden"
              id="material-upload"
              ref={fileRef}
              type="file"
              multiple
              accept=".txt,.md,.pdf"
              onChange={(e) => void onUpload(e)}
              data-testid="material-upload"
              /* Both spreads write aria-describedby, so they are merged by
                 hand rather than layered: spreading one after the other let the
                 second silently replace the first, and the hint the picker
                 needs most is the one naming what it accepts. */
              {...fieldAria("material-upload", { hint: true })}
              {...inertAttrs("material-upload", uploadReason)}
              {...(uploadReason === null
                ? {}
                : {
                    "aria-describedby": `${fieldHintId("material-upload")} ${inertNoteId("material-upload")}`,
                  })}
            />
          </div>
        </Field>
        <InertNote control="material-upload" reason={uploadReason} />
        {busy !== null && (
          <p className="small muted" role="status" data-testid="material-busy">
            {busy}
          </p>
        )}
        {error !== null && (
          <p className="error small" role="alert" data-testid="material-error">
            {error}
          </p>
        )}
        {/* An observation about the corpus, in the muted register the rest of
            the page uses for observations. It was an .error saying the
            researcher was blocked, on a screen with nothing on it that could
            unblock them. See src/state/chunks.ts. */}
        {sizeNote !== null && (
          <p className="small muted" data-testid="material-size-note">
            {sizeNote}
          </p>
        )}
        {/* R4 item 3. Ten sentences stood around this one control, three
            before it and seven after, with the accepted formats stated twice. */}
        {/* M62, ISC-600: The data fold moved into the page's Help control (ui/pageHelp.ts). */}
      </div>

      {/* Finding one document among forty, which the surface had no way to do.
          The two selects are the half no incumbent can copy: ATLAS.ti groups a
          document manager by document group, code and author, and neither it
          nor NVivo knows which passages you have opened or which the model is
          citing back at you. "Passages you have not opened" is the lede of this
          page turned into a control. */}
      {documents.length > 0 && (
        <div className="corpus-find" data-testid="corpus-find">
          <Field
            label="Search data"
            htmlFor="corpus-find-input"
            hint="Type a word to match a file name, a kind of file, or the text inside a passage."
          >
            <input
              id="corpus-find-input"
              type="search"
              value={query}
              /* No placeholder. It read "handover", which is a word that is
                 also in the corpus, so an empty box and a box holding a search
                 looked alike at a glance and the hint above already says what
                 the field matches. */
              /* Chrome restores a search field's text on reload, after React
                 has rendered and without telling it, so the box came back
                 holding "handover" over a list showing the whole corpus: the
                 control and the count disagreeing, which is the one thing this
                 pair keeps being sent back for. The state is the truth here. */
              autoComplete="off"
              onChange={(e) => setQuery(e.target.value)}
              data-kbd="primary-input"
              data-testid="corpus-find-input"
              {...fieldAria("corpus-find-input", { hint: true })}
            />
          </Field>
          <div className="corpus-find-row">
            <label htmlFor="corpus-show" className="small muted">
              Show
            </label>
            <select
              id="corpus-show"
              value={show}
              onChange={(e) => setShow(e.target.value as CorpusShow)}
              data-testid="corpus-show"
            >
              {CORPUS_SHOWS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <label htmlFor="corpus-sort" className="small muted">
              Order
            </label>
            <select
              id="corpus-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as CorpusSort)}
              data-testid="corpus-sort"
            >
              {CORPUS_SORTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            {view.narrowed && (
              <button
                type="button"
                className="linkish"
                onClick={clearView}
                data-testid="corpus-find-clear"
              >
                Show all
              </button>
            )}
          </div>
          {/* The count of what is on screen against the count of what the study
              holds, in one sentence, always present. A researcher who filters
              to three documents and later reads a total of two has to be able
              to tell a view from a corpus that has lost something. */}
          <p className="small muted corpus-find-note" role="status" data-testid="corpus-find-note">
            {corpusViewNote(view)}
          </p>
        </div>
      )}

      <div className="corpus-docs row-list" ref={attentionRef} data-testid="corpus-docs">
        {documents.length > 0 && view.rows.length === 0 && (
          <EmptyState
            /* M32 R10. "observation" for both states on this list: the material
               is what an observation in the model will cite, and a page-type
               mark names the family rather than any page. No action on either,
               and the reason is written under the second one. */
            mark="observation"
            status="Your search matches none of your passages."
            teach={`Your data still has ${documents.length} document${documents.length === 1 ? "" : "s"} and ${chunks.length} passage${chunks.length === 1 ? "" : "s"}. Clear the search box or widen the two menus to bring them back.`}
            testId="corpus-find-empty"
          />
        )}
        {documents.length === 0 && (
          /* No action, and that is the correction rather than an omission. The
             direct path this empty state would offer is the picker 40px above
             it, permanently mounted because adding material is not something
             you do only once. A second button opening the same file dialog put
             two pickers on one screen and made the researcher choose between
             identical controls. */
          <EmptyState
            mark="observation"
            status="Your data appears under this heading."
            teach="Add a file above to start."
            testId="material-empty"
          />
        )}
        {view.rows.map((row) => {
          const doc = row.doc;
          /* The fold is open because the researcher opened it, and where they
             have not said, because the search landed inside it or because a link
             asked for a passage of it. A hit behind a closed disclosure is not a
             hit the researcher can see. */
          const isOpen = toggled[doc.id] ?? (row.hitInText || doc.id === askedDocument);
          return (
            <details
              className="corpus-doc"
              key={doc.id}
              open={isOpen}
              onToggle={(e) =>
                setToggled((current) => ({
                  ...current,
                  [doc.id]: (e.target as HTMLDetailsElement).open,
                }))
              }
            >
              {/* The name a screen reader reads, because the one it computed
                  from the row was "b-transcript.txtfieldnotepassages1words7
                  opened1cited0": five chips with no separator between a label
                  and its number or between one chip and the next. It opens with
                  the file name, so the spoken name still starts with the
                  visible one.

                  M32 R8: the summary IS the row, so it carries the primitive's
                  state class. It keeps the flex box material.css draws for it —
                  `Row` cannot own a `<summary>`, and a `<summary>` that took a
                  display value from anywhere else is how this surface lost its
                  disclosure markers once already. What it takes is the hairline
                  between neighbours, the hover surface and the 44px minimum.

                  No reveal cluster on this one, and that is a constraint rather
                  than an omission: this row's controls are the kind select and
                  Remove, both of them inside the fold, and material.css already
                  records why they cannot come up onto the summary — a control
                  in a `<summary>` swallows the toggle and puts itself before
                  the thing it labels in the keyboard order. The disclosure
                  triangle is this row's reveal. */}
              <summary
                className={rowClass()}
                aria-label={documentRowLabel(doc.name, { kind: documentKindLabel(doc.kind) })}
              >
                <span className="corpus-doc-name">{doc.name}</span>
                {/* Facts about the document, never about the filtered subset of
                    it. A row that said PASSAGES 1 because a search matched one
                    of its nine would be the count defect this pair was sent
                    back for twice, in a third place. What the view is not
                    showing is stated under the row instead. */}
                {/* The four counts went with the five above (M49, ISC-530).
                    What is left is what the file is, which is the one fact on
                    the row a researcher acts on: a file filed wrong is retagged
                    from inside the fold. */}
                <span className="corpus-doc-meta">
                  <StatusChip label={documentKindLabel(doc.kind)} />
                </span>
              </summary>
              <div className="corpus-doc-actions">
                <label htmlFor={`retag-${doc.id}`} className="small muted">
                  Kind
                </label>
                {/* Every kind, including paper, which is the way out of the
                    defect that named this section: a file that turns out to be
                    literature is retagged from its own row and moves up to the
                    papers above, and stops being counted as evidence. */}
                <select
                  id={`retag-${doc.id}`}
                  value={doc.kind}
                  onChange={(e) => void retag(doc, e.target.value as DocumentKind)}
                  data-testid={`retag-${doc.id}`}
                >
                  {DOCUMENT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {documentKindLabel(k)}
                    </option>
                  ))}
                </select>
                <span className="small muted">
                  Change the kind whenever you like, and everything recorded about your project stays
                  as it was. Mark a file as a paper and the file moves up to the papers above.
                </span>
              </div>
              {/* Retagging fixes a file filed wrong. This is for a file that
                  should not be here at all. Anything that cited it keeps the
                  citation. */}
              <RemoveDocument
                projectId={projectId}
                document={doc}
                chunks={chunks}
                armed={arming === doc.id}
                onArm={() => setArming(doc.id)}
                onCancel={() => setArming(null)}
                onRemoved={onAdded}
              />
              {row.withheld > 0 && (
                <p className="small muted corpus-doc-withheld" data-testid={`withheld-${doc.id}`}>
                  {row.withheld} more passage{row.withheld === 1 ? "" : "s"} in this document
                  {row.withheld === 1 ? " sits" : " sit"} outside what you are showing.
                </p>
              )}
              <div className="chunk-list">
                {row.chunks.map((chunk) => (
                  <Passage
                    key={chunk.id}
                    chunk={chunk}
                    opened={opened.has(chunk.id)}
                    cited={cited.has(chunk.id)}
                    {...(chunk.id === askedPassage ? { startOpen: true } : {})}
                  />
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
