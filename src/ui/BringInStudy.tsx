/**
 * The way into a study you did not name yourself (M36).
 *
 * The tool could write a re-importable bundle from the Exports tab and had no
 * door to read one back through, so a study a co-author sent you was a file
 * with nowhere to go. The control here opens that door.
 *
 * Until M91 (2026-10-14) a second control beside it opened the example project
 * that shipped with the app. The owner removed the example ("Let's remove the
 * example project"); a copy already in a browser opens as an ordinary project.
 *
 * One component rather than two copies, because both surfaces that offer
 * the file control (the front page and the studies list) have to say the same
 * thing about the same act. Two copies of a sentence is how two screens end up
 * describing one control differently.
 *
 * The ledger comes from context and not from a module-level import. There is
 * one store instance for the whole tree, and an import that wrote events
 * around it would leave every view on screen deriving from a log that is
 * already out of date.
 *
 * The control opens the study on Design when it is done, which is where a
 * researcher reading someone else's study starts: the framing, then the seven
 * questions behind it.
 */

import { useState, type ChangeEvent } from "react";
import { appBundleStores, importBundleJson, importFailureMessage } from "../export/importStudy.ts";
import { useLedger } from "../state/ledgerContext.tsx";
import { Field, fieldAria } from "./components/index.ts";
import { navigate, studyPath } from "./routes.ts";

/** The picker's id, so the label can be its face and the hint can be read. */
const PICKER_ID = "bring-in-study";

/** While a study is being written. */
const OPENING = "Opening the project…";

/**
 * Choose a bundle and open it.
 *
 * The native control is behind the label, the way the Material picker's is
 * (M32c, fix 4): `<input type="file">` renders two strings the browser owns
 * and no CSS reaches either, so the face is the label and the input is
 * `.visually-hidden` and still in the tab order.
 *
 * The input's value is cleared on every change. Without it, a researcher who
 * picks the same file twice, because the first attempt showed them an error
 * they then went and fixed, gets no `change` event the second time and no sign
 * that anything happened.
 */
export function BringInStudy() {
  const { appendAll } = useLedger();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file === undefined || busy) return;
    setBusy(true);
    setError(null);
    try {
      const project = await importBundleJson(
        await file.text(),
        "bundle",
        appBundleStores(appendAll),
      );
      setBusy(false);
      navigate(studyPath(project.id));
    } catch (err) {
      setError(importFailureMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="bringin" data-testid="bringin">
      <Field
        label="Import project"
        htmlFor={PICKER_ID}
        hint="Open the JSON file of a project that someone exported and sent you."
        labelIsControl
      >
        <input
          className="visually-hidden"
          id={PICKER_ID}
          type="file"
          accept=".json,application/json"
          onChange={(e) => void choose(e)}
          data-testid="bringin-input"
          {...fieldAria(PICKER_ID, { hint: true })}
        />
      </Field>
      {busy && (
        <p className="small muted" role="status" data-testid="bringin-busy">
          {OPENING}
        </p>
      )}
      {error !== null && (
        <p className="error small" role="alert" data-testid="bringin-error">
          {error}
        </p>
      )}
    </div>
  );
}
