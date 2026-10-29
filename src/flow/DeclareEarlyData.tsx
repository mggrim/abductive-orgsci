/**
 * "I already have some initial data", on the two surfaces that offer it
 * (M49, ISC-529).
 *
 * A co-author, on their first use, 2026-09-21: Material should be the papers you
 * are arguing with, and the data should be behind a control you press when you
 * have some. Most studies that reach this tool have no data yet, and Material
 * opened on an empty data pane carrying five counts, a search box, two sort
 * menus and an empty-state card. A first-time researcher reads that and learns
 * that the tool is about files.
 *
 * One component for both places, because it is one act. On Material the data
 * section is the pane beside the papers and pressing this opens it in place. At
 * the Early data step the uploader is a tab away, so the press also goes there:
 * `stageReason` has told researchers "Add your data on the Material tab" since
 * D5, and a control that records the fact and then leaves them looking at the
 * step that cannot take a file would be the tool giving an instruction and not
 * following it.
 *
 * The press is recorded (`declareEarlyData`), so the section is open on every
 * later visit, in every tab, and in the bundle a co-author is sent.
 */

import { useCallback, useState } from "react";
import { declareEarlyData } from "../state/projects.ts";
import { navigate, studyPath } from "../ui/routes.ts";

/** The control's name, wherever it is drawn and wherever it is asserted. */
export const DECLARE_DATA_LABEL = "I have early data";

export function DeclareEarlyData(props: {
  projectId: string;
  /**
   * Where the press leaves the researcher.
   *
   * `"here"` on Material, where the section opens beside the papers. `"material"`
   * at the Early data step, where the uploader is one tab away.
   */
  land: "here" | "material";
  /** So the surface can re-read the project it is rendering from. The
   * `closedReason` of ISC-607 went at M85 (ISC-712): Sources is open from the
   * start, so the press always lands. */
  onDeclared: () => void;
}) {
  const { projectId, land, onDeclared } = props;
  const [busy, setBusy] = useState(false);

  const declare = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await declareEarlyData(projectId);
      onDeclared();
      if (land === "material") navigate(studyPath(projectId, "material"));
    } finally {
      setBusy(false);
    }
  }, [busy, projectId, land, onDeclared]);

  return (
    <div className="declare-data" data-testid="declare-data">
      <button
        type="button"
        className="btn-quiet"
        onClick={() => void declare()}
        disabled={busy}
        data-testid="declare-data-button"
      >
        {DECLARE_DATA_LABEL}
      </button>
      {/* What the press does, in one sentence, because the control names a fact
          about the researcher rather than an action on the screen. */}
      <p className="small muted">
        {land === "here"
          ? "Pressing this opens a section under the papers where you add transcripts, fieldnotes, memos and archives."
          : "Pressing this opens the Sources tab, where you add transcripts, fieldnotes, memos and archives."}
      </p>
    </div>
  );
}
