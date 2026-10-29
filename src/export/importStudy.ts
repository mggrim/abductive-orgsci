/**
 * Bringing a study in (M36).
 *
 * `bundle.ts` has been able to read a bundle since ISC-35 and nothing could
 * hand it one. The Exports tab writes `bounds-bundle` v1, `parseBundle` reads
 * it, `remapBundleIds` gives it fresh ids so a second copy lands beside the
 * first without colliding with the ledger's unique event-id index, and
 * `importBundle` writes it through injectable stores. What was missing was the
 * three lines that join those four together, a set of stores wired to the real
 * app, and sentences for the ways a file fails.
 *
 * Remapping is not optional here. Every id in a bundle is the id it had in the
 * ledger it left, and the ledger store indexes event ids uniquely, so an
 * import that kept them would collide the moment the same bundle arrived
 * twice, which is exactly what a co-author does when she is not sure the first
 * one worked.
 *
 * What the researcher is told when a file will not open is written here rather
 * than in the component, so the two surfaces that offer the control cannot
 * drift into two accounts of the same failure. `BundleParseError` carries a
 * developer's detail; these are the sentences a reader gets.
 *
 * M91 (2026-10-14): the example project that shipped under `public/examples/`
 * left the product at the owner's word, and with it the fetch, the lookup of
 * the copy a browser already held, and the two sentences for an example that
 * would not open. Its bundle is the test fixture
 * `tests/fixtures/coldharbour.bundle.json`, the same bytes.
 */

import {
  BundleParseError,
  importBundle,
  parseBundle,
  remapBundleIds,
  type BundleStores,
  type ProjectBundle,
} from "./bundle.ts";
import type { LedgerEvent } from "../ledger/events.ts";
import {
  saveAnomaly,
  saveChunks,
  saveDocument,
  saveProject,
  saveTwin,
  type Project,
  type StudyOrigin,
} from "../state/projects.ts";

/**
 * The app's own stores, minus the ledger.
 *
 * The ledger is passed in because the one store instance for the whole tree
 * lives in React context, and a module reaching around it would write events
 * that the views on screen do not know about until the next reload.
 */
export function appBundleStores(
  appendEvents: (events: readonly LedgerEvent[]) => Promise<void>,
): BundleStores {
  return { saveProject, saveDocument, saveChunks, saveAnomaly, saveTwin, appendEvents };
}

/**
 * Read a bundle, give it fresh ids, mark which door it came through, write it.
 *
 * Returns the study as stored, so the caller can open it. Throws
 * `BundleParseError` for anything the parser refuses; `importFailureMessage`
 * turns that into the sentence a researcher reads.
 */
export async function importBundleJson(
  json: string,
  importedAs: StudyOrigin,
  stores: BundleStores,
  makeId: () => string = () => crypto.randomUUID(),
): Promise<Project> {
  const parsed = parseBundle(json);
  const fresh = remapBundleIds(parsed, makeId);
  const marked: ProjectBundle = { ...fresh, project: { ...fresh.project, importedAs } };
  return importBundle(marked, stores);
}

/**
 * What a researcher is told when a file will not open.
 *
 * Three sentences for three failures, each naming what to do next. The
 * parser's own message names a field and a version and is addressed to whoever
 * is holding the file format; this is addressed to the person at the picker.
 */
export function importFailureMessage(err: unknown): string {
  if (err instanceof BundleParseError) {
    const detail = err.message.replace(/^Cannot import bundle: /, "");
    if (detail.includes("valid JSON")) {
      return "That file isn't a project export. Choose the JSON file from the Export tab.";
    }
    if (detail.includes("bounds-bundle")) {
      return "That export came from a different version of Abductive. Ask for a fresh export.";
    }
    return `That project is missing something that Abductive needs to open it: ${detail}.`;
  }
  return "Abductive couldn't read that file. Choose the file again, or ask for a fresh export.";
}
