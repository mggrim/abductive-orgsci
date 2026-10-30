/**
 * Search the project (M53, ISC-545; a dialog of its own since M96, ISC-794).
 *
 * It opened on Mod+K and from the Search button in the study bar, which sent the
 * same keystroke. The owner took the keyboard shortcuts out on 2026-10-30 ("the
 * keyboard shortcuts should be eliminated"), so the Search button opens the
 * dialog itself, and the dialog lists the claims, passages, answers, papers and
 * findings that match the search. Every result is a place inside the project:
 * choosing one navigates, and the page it lands on selects the thing. The arrow
 * keys and Enter inside the field are the combobox's own, as the ARIA pattern
 * has them.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { navigate } from "./routes.ts";
import { useWorkbench } from "../workbench/useWorkbench.ts";
import { livePages } from "../ontology/schema.ts";
import { paperRows } from "../views/paperRows.ts";
import { puzzleState } from "../views/puzzleReading.ts";
import {
  SEARCH_KIND_LABEL,
  buildSearchIndex,
  searchStudy,
  type SearchEntry,
  type SearchResult,
} from "../search/studySearch.ts";

function rowId(result: SearchResult): string {
  return `search-found-${result.entry.kind}-${result.entry.id}`;
}

/**
 * The study, folded into search entries, while the palette is open.
 *
 * A component rather than a hook in the palette, so the workbench projection is
 * built only while the palette is open inside a study and never on a route with
 * no study. It reads projections the tabs already compute and writes nothing.
 */
function StudyIndex(props: { projectId: string; onIndex: (entries: readonly SearchEntry[]) => void }) {
  const { projectId, onIndex } = props;
  const wb = useWorkbench(projectId);
  const entries = useMemo(() => {
    if (wb.brief === undefined) return [];
    const papers = paperRows({
      events: wb.events,
      projectId,
      documents: wb.documents,
      chunks: wb.chunks,
      ...(wb.brief.seminalCorpus === undefined ? {} : { typedList: wb.brief.seminalCorpus }),
    });
    const puzzle = puzzleState({
      brief: wb.brief,
      chunks: wb.chunks,
      documents: wb.documents,
      events: wb.events,
      projectId,
    });
    return buildSearchIndex({
      projectId,
      brief: wb.brief,
      ...(puzzle.kind === "read" || puzzle.kind === "stated" ? { puzzle: puzzle.text } : {}),
      pages: livePages(wb.graph),
      chunks: wb.chunks,
      documents: wb.documents,
      papers,
    });
  }, [projectId, wb.brief, wb.events, wb.graph, wb.documents, wb.chunks]);
  useEffect(() => onIndex(entries), [entries, onIndex]);
  return null;
}

export function StudySearch(props: {
  open: boolean;
  /** The project being searched. */
  projectId: string;
  onClose: () => void;
}) {
  const { open, projectId, onClose } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);
  const [index, setIndex] = useState<readonly SearchEntry[]>([]);

  const rows = useMemo<readonly SearchResult[]>(
    () => (query.trim() === "" ? [] : searchStudy(index, query)),
    [query, index],
  );

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      setQuery("");
      setAt(0);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    const onNativeClose = () => onClose();
    dialog.addEventListener("close", onNativeClose);
    return () => dialog.removeEventListener("close", onNativeClose);
  }, [onClose]);

  function choose(result: SearchResult | undefined) {
    // A result reaches `navigate` and nothing else, and only a route in this project.
    if (result === undefined) return;
    const href = result.entry.href;
    if (!href.startsWith(`#/study/${projectId}/`)) return;
    onClose();
    navigate(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setAt((n) => (rows.length === 0 ? 0 : (n + delta + rows.length) % rows.length));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      choose(rows[at]);
    }
  }

  const name = "Search project";
  const current = rows[at];

  return (
    <dialog className="study-search" ref={ref} aria-label={name} data-testid="palette">
      {open && <StudyIndex projectId={projectId} onIndex={setIndex} />}
      <div className="study-search-body" onKeyDown={onKeyDown}>
        <input
          className="study-search-field"
          type="text"
          value={query}
          autoFocus
          placeholder={name}
          aria-label={name}
          role="combobox"
          aria-expanded={rows.length > 0}
          aria-controls="study-search-list"
          aria-autocomplete="list"
          {...(current === undefined ? {} : { "aria-activedescendant": rowId(current) })}
          data-testid="palette-input"
          onChange={(e) => {
            setQuery(e.target.value);
            setAt(0);
          }}
        />
        <p className="study-search-hint small muted">
          Search the claims, passages, answers and papers in this project. Select a result to go to its place in the
          project. Abductive leaves your project unchanged when you search.
        </p>
        {query.trim() !== "" && rows.length === 0 && (
          <p className="study-search-none small muted" data-testid="palette-none">
            Your search matches none of the entries.
          </p>
        )}
        {rows.length > 0 && (
          <ul className="study-search-list" id="study-search-list" role="listbox" aria-label="Results">
            {rows.map((result, i) => (
              <li
                className="study-search-row"
                key={rowId(result)}
                id={rowId(result)}
                role="option"
                aria-selected={i === at}
                data-at={i === at}
                data-kind={result.entry.kind}
                data-testid="palette-row"
                onMouseEnter={() => setAt(i)}
                onClick={() => choose(result)}
              >
                <span className="study-search-found">
                  <span className="study-search-title">{result.entry.title}</span>
                  {result.snippet !== "" && (
                    <span className="study-search-snippet small muted">{result.snippet}</span>
                  )}
                </span>
                <span className="study-search-kind small muted">{SEARCH_KIND_LABEL[result.entry.kind]}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="study-search-foot">
          <button type="button" className="btn-quiet" onClick={onClose} data-testid="palette-close">
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
