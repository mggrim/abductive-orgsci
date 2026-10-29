/**
 * The palette, and what it deliberately cannot do (FND-02).
 *
 * Every palette worth copying is a command palette: Linear's runs actions,
 * VS Code's runs commands. This one goes places and nothing else, and that is
 * not a limitation to be lifted later. A palette that could run actions would
 * be a text field where typing eight characters and pressing Enter accepts a
 * page or spends a model call, which is the exact shape the governing rule
 * exists to prevent. Its places are the navigate rows of the keyboard table, so
 * there is no list of commands anywhere for a later builder to extend by
 * accident.
 *
 * M53, ISC-545: a search of the study as well. The owner: "Turn cmdK into a
 * search." Inside a study, typing searches its claims, passages, saved answers,
 * papers and findings (`search/studySearch.ts`), and every result is an href
 * inside the study: choosing one navigates, and the page it lands on selects
 * the thing. The rule above is unchanged and is held the same way, in `choose`:
 * a result reaches `navigate` and nothing else.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { bindingsInScope, type Binding, type Scope } from "./bindings.ts";
import { Caps } from "./Caps.tsx";
import { navigate } from "../routes.ts";
import { useWorkbench } from "../../workbench/useWorkbench.ts";
import { livePages } from "../../ontology/schema.ts";
import { paperRows } from "../../views/paperRows.ts";
import { puzzleState } from "../../views/puzzleReading.ts";
import {
  SEARCH_KIND_LABEL,
  buildSearchIndex,
  searchStudy,
  type SearchEntry,
  type SearchResult,
} from "../../search/studySearch.ts";

/** One row of the list: a place from the table, or something the study holds. */
type Row =
  | { readonly kind: "place"; readonly binding: Binding }
  | { readonly kind: "found"; readonly result: SearchResult };

function rowId(row: Row): string {
  return row.kind === "place"
    ? `kbd-place-${row.binding.id}`
    : `kbd-found-${row.result.entry.kind}-${row.result.entry.id}`;
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

export function CommandPalette(props: {
  open: boolean;
  scope: Scope;
  /** The study being searched, on a study route. */
  projectId?: string;
  onClose: () => void;
  onGo: (binding: Binding) => void;
}) {
  const { open, scope, projectId, onClose, onGo } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);
  const [index, setIndex] = useState<readonly SearchEntry[]>([]);
  const searching = projectId !== undefined;

  const places = useMemo(
    () => bindingsInScope(scope).filter((b) => b.effect === "navigate"),
    [scope],
  );
  const rows = useMemo<readonly Row[]>(() => {
    const q = query.trim().toLowerCase();
    const placeRows: Row[] = (
      q === "" ? places : places.filter((b) => b.label.toLowerCase().includes(q))
    ).map((binding) => ({ kind: "place", binding }));
    if (!searching || q === "") return placeRows;
    const found: Row[] = searchStudy(index, query).map((result) => ({ kind: "found", result }));
    return [...found, ...placeRows];
  }, [places, query, searching, index]);

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

  function choose(row: Row | undefined) {
    // Belt and braces over the filters above. Navigation is the only thing this
    // control is allowed to reach, and the check is here rather than in a
    // comment so that widening a filter is not enough to widen the palette: a
    // place must be a navigate row, and a result must be a route in this study.
    if (row === undefined) return;
    if (row.kind === "place") {
      if (row.binding.effect !== "navigate") return;
      onClose();
      onGo(row.binding);
      return;
    }
    const href = row.result.entry.href;
    if (projectId === undefined || !href.startsWith(`#/study/${projectId}/`)) return;
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

  const name = searching ? "Search project" : "Go to";
  const current = rows[at];

  return (
    <dialog className="kbd-palette" ref={ref} aria-label={name} data-testid="palette">
      {open && projectId !== undefined && <StudyIndex projectId={projectId} onIndex={setIndex} />}
      {/* The keys are handled here rather than on the input so a click on a row
          and an arrow from the field are the same list. */}
      <div className="kbd-palette-body" onKeyDown={onKeyDown}>
        {/* The combobox pattern rather than a list of buttons: focus stays in
            the field the researcher is typing in and the active row is named
            by aria-activedescendant, so arrowing down does not move focus out
            of the text they are still editing. */}
        <input
          className="kbd-palette-field"
          type="text"
          value={query}
          autoFocus
          placeholder={name}
          aria-label={name}
          role="combobox"
          aria-expanded={rows.length > 0}
          aria-controls="kbd-palette-list"
          aria-autocomplete="list"
          {...(current === undefined ? {} : { "aria-activedescendant": rowId(current) })}
          data-testid="palette-input"
          onChange={(e) => {
            setQuery(e.target.value);
            setAt(0);
          }}
        />
        <p className="kbd-palette-hint small muted">
          {searching
            ? "Search the claims, passages, answers and papers in this project. Every result takes you to its place in the project. Searching leaves your project as it is."
            : "Every entry here goes somewhere. Searching leaves your project as it is."}
        </p>
        {rows.length === 0 ? (
          <p className="kbd-palette-none small muted" data-testid="palette-none">
            Your search matches none of the entries.
          </p>
        ) : (
          <ul className="kbd-palette-list" id="kbd-palette-list" role="listbox" aria-label="Results">
            {rows.map((row, i) => (
              <li
                className="kbd-palette-row"
                key={rowId(row)}
                id={rowId(row)}
                role="option"
                aria-selected={i === at}
                data-at={i === at}
                data-kind={row.kind === "place" ? "place" : row.result.entry.kind}
                data-testid="palette-row"
                onMouseEnter={() => setAt(i)}
                onClick={() => choose(row)}
              >
                {row.kind === "place" ? (
                  <>
                    <span>{row.binding.label}</span>
                    <Caps keys={row.binding.keys} />
                  </>
                ) : (
                  <>
                    <span className="kbd-palette-found">
                      <span className="kbd-palette-title">{row.result.entry.title}</span>
                      {row.result.snippet !== "" && (
                        <span className="kbd-palette-snippet small muted">{row.result.snippet}</span>
                      )}
                    </span>
                    <span className="kbd-palette-kind small muted">
                      {SEARCH_KIND_LABEL[row.result.entry.kind]}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}
