/**
 * Project bundle export/import (ISC-35): one JSON document holding the
 * project, documents, chunks, anomalies, twin, and complete ledger event log.
 * `importBundle` round-trips to deep-equal state. Re-exporting an imported
 * bundle reproduces it exactly. A NEW project id (and consistently remapped
 * record/event ids, via `remapBundleIds`) is allowed so a bundle can be
 * re-imported into the browser it came from without colliding with the
 * ledger's unique event-id index; content stays identical either way.
 *
 * All builders/parsers are pure; persistence goes through an injectable
 * `BundleStores` so tests run against in-memory stores.
 */

import type { LedgerEvent } from "../ledger/events.ts";
import { validateEvent } from "../ledger/events.ts";
import { restoreLedgerAsWritten } from "../ledger/displayProse.ts";
import { serializeRecord } from "./recordJson.ts";
import type { AnomalyCandidate, Chunk, StoredDocument } from "../state/chunks.ts";
import type { Project } from "../state/projects.ts";
import type { ModalTwin } from "../twin/twin.ts";
import { downloadText, slugify } from "./download.ts";

export interface ProjectBundle {
  readonly format: "bounds-bundle";
  readonly version: 1;
  readonly project: Project;
  readonly documents: readonly StoredDocument[];
  readonly chunks: readonly Chunk[];
  readonly anomalies: readonly AnomalyCandidate[];
  readonly twin: ModalTwin | null;
  readonly events: readonly LedgerEvent[];
}

export function buildBundle(parts: {
  readonly project: Project;
  readonly documents: readonly StoredDocument[];
  readonly chunks: readonly Chunk[];
  readonly anomalies: readonly AnomalyCandidate[];
  readonly twin: ModalTwin | null;
  readonly events: readonly LedgerEvent[];
}): ProjectBundle {
  const projectId = parts.project.id;
  return {
    format: "bounds-bundle",
    version: 1,
    project: parts.project,
    documents: parts.documents.filter((d) => d.projectId === projectId),
    chunks: parts.chunks.filter((c) => c.projectId === projectId),
    anomalies: parts.anomalies.filter((a) => a.projectId === projectId),
    twin: parts.twin !== null && parts.twin.projectId === projectId ? parts.twin : null,
    events: parts.events.filter((e) => e.projectId === projectId),
  };
}

/**
 * Through `serializeRecord`, never `JSON.stringify`.
 *
 * This is the harder of the two record exports. `bundleFromStores` restores
 * `asWritten` before serialising, so a bundle carries the model's original
 * sentence in the live field rather than in a provenance bag: importing the
 * reading would install the tool's sentence as the thing that happened in a
 * second researcher's ledger. That is right, and it is also what put twelve
 * banned dashes in `bundle.json`. `recordJson.ts` says why the escape is the
 * only treatment that keeps both the round trip and the rule.
 *
 * `parseBundle` needs no counterpart: `JSON.parse` decodes the escape, so a
 * re-export of an imported bundle reproduces the file byte for byte.
 */
export function serializeBundle(bundle: ProjectBundle): string {
  return serializeRecord(bundle);
}

export class BundleParseError extends Error {
  constructor(detail: string) {
    super(`Cannot import bundle: ${detail}`);
    this.name = "BundleParseError";
  }
}

/** Parse + validate a serialized bundle (every event re-validated). */
export function parseBundle(json: string): ProjectBundle {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new BundleParseError("file is not valid JSON");
  }
  if (typeof raw !== "object" || raw === null) {
    throw new BundleParseError("bundle must be a JSON object");
  }
  const bundle = raw as Record<string, unknown>;
  if (bundle.format !== "bounds-bundle" || bundle.version !== 1) {
    throw new BundleParseError("unrecognized format: expected bounds-bundle v1");
  }
  const project = bundle.project as Project | undefined;
  if (project === undefined || typeof project.id !== "string" || project.id === "") {
    throw new BundleParseError("bundle has no project record");
  }
  for (const key of ["documents", "chunks", "anomalies", "events"] as const) {
    if (!Array.isArray(bundle[key])) {
      throw new BundleParseError(`bundle.${key} must be an array`);
    }
  }
  const events = bundle.events as unknown[];
  events.forEach((event, i) => {
    const errors = validateEvent(event);
    if (errors.length > 0) {
      throw new BundleParseError(`event #${i} invalid: ${errors.join("; ")}`);
    }
  });
  return {
    format: "bounds-bundle",
    version: 1,
    project,
    documents: bundle.documents as StoredDocument[],
    chunks: bundle.chunks as Chunk[],
    anomalies: bundle.anomalies as AnomalyCandidate[],
    twin: (bundle.twin ?? null) as ModalTwin | null,
    /*
     * Provenance put back before anything else sees the events.
     *
     * A bundle leaves through the same read boundary every other export does,
     * so its model-authored fields arrive in the tool's voice with the original
     * on `asWritten` (see `displayProse.ts`). This is the one export that gets
     * imported, and importing the reading would make the tool's sentence the
     * thing that happened in a second researcher's ledger. Restoring here is
     * the last step of the round trip rather than an exception to it: the
     * imported ledger matches the exporting one, and re-exporting re-derives
     * the identical file.
     */
    events: restoreLedgerAsWritten(events as LedgerEvent[]),
  };
}

// ---------------------------------------------------------------------------
// Consistent id remapping (import-into-same-browser support)
// ---------------------------------------------------------------------------

function mapId(map: Map<string, string>, id: string): string {
  return map.get(id) ?? id;
}

/**
 * Every reference an event holds, rewritten in one pass (D18).
 *
 * This was a switch over the event union, one case per type, naming the fields
 * that hold a cross-reference. It went stale the first time anyone added a
 * field, and the way that showed up was a study that imported and looked
 * complete: `paper-fit.paperKey` is the document id for an uploaded paper, it
 * was not in the switch, so an imported copy of a study showed its own
 * uploaded paper as "not judged yet" while the verdict sat in the ledger under
 * the id the document used to have. The Design band counted four papers as
 * three. Nothing threw, nothing linted, and the record was internally
 * inconsistent in a way only a reader would notice.
 *
 * The switch could not have caught that, because the switch is a list and the
 * defect is a field that is not on it. Eight more were not on it either: the
 * chunk on a paper baseline, the composite baseline id, the `[[chunk:ID]]`
 * citations inside a page body, a structural finding id with a chunk id in the
 * middle of it, a lint finding's target, a question's topic and move id and
 * alternatives, and the `sourceTurn` and `supportingTurn` that say which
 * answer a draft came out of.
 *
 * So the rule is stated once instead of enumerated. An id this remap
 * regenerated is rewritten wherever it appears in an event, at whatever depth,
 * whether it is the whole of a field or one token inside a longer key. A field
 * added tomorrow is covered the day it is added, which is the property the
 * switch could never have.
 *
 * What makes that safe is that ids are opaque: `crypto.randomUUID` writes
 * every one of them, and a uuid appearing in a string is a reference to that
 * record rather than a coincidence. Page ids, proposal ids and move ids pass
 * through untouched because they are not in the map: they are internal to one
 * bundle, every event carrying one is rewritten to the new project, and two
 * copies of one study never meet.
 */
/**
 * Two passes, because one of them has a gap the other closes.
 *
 * The token pass reads a string as runs of id characters and looks each run
 * up. That handles a field that holds nothing but an id, and it handles every
 * composite this codebase writes, because all of them join with a character
 * that is not an id character: `[[chunk:ID]]`, `structural:<rule>:<chunkId>`,
 * `literature:baseline:<documentId>#<hash>@5`, `obligation:<page>~<page>@7`.
 *
 * Its gap is a composite that joins with a hyphen, since a hyphen is an id
 * character and `paper-<documentId>` would come back as one token that is in
 * no map. Nothing writes that shape today, and the point of doing this
 * generally rather than field by field is that tomorrow is covered too.
 *
 * So the second pass reads uuids wherever they sit, whatever surrounds them.
 * Every id in a bundle written by this tool comes from `crypto.randomUUID`, so
 * between them the two passes see every reference in any syntax. Running the
 * uuid pass second is safe because a fresh id is a value in the map and never
 * a key: `map.get` on one misses, and nothing is rewritten twice.
 */
const ID_TOKEN = /[A-Za-z0-9_][A-Za-z0-9_-]*/g;
const ID_UUID = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;

function rewriteIds<T>(value: T, map: Map<string, string>): T {
  if (typeof value === "string") {
    return value
      .replace(ID_TOKEN, (token) => map.get(token) ?? token)
      .replace(ID_UUID, (uuid) => map.get(uuid) ?? uuid) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => rewriteIds(item, map)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, rewriteIds(v, map)]),
    ) as T;
  }
  return value;
}

/**
 * The envelope stays explicit.
 *
 * `id` and `projectId` are rewritten by the pass above already, since both are
 * in the map. They are written again here because a bundle whose project id
 * somehow missed the map would otherwise import events belonging to a project
 * that is not there, and an event scoped to the wrong study is invisible
 * rather than wrong, which is the hardest kind of defect to see.
 */
function remapEvent(
  event: LedgerEvent,
  map: Map<string, string>,
  projectId: string,
): LedgerEvent {
  return { ...rewriteIds(event, map), id: mapId(map, event.id), projectId };
}

/**
 * Produce a content-identical bundle with every id that has to change
 * regenerated, and every reference to one rewritten through the same map.
 *
 * Five families are regenerated, and they are exactly the ids that cannot be
 * allowed to repeat: the project, its documents, chunks, anomalies and twin,
 * because each keys an IndexedDB store on `id`, and every event, because the
 * ledger indexes event ids uniquely across projects. That is what lets the
 * same bundle be imported twice into the browser it came from.
 *
 * Everything else keeps the id it arrived with. Page ids, proposal ids, move
 * ids and finding ids are internal to one study, every event carrying one is
 * rewritten to the new project, and no projection reads across projects, so
 * two copies of a study never see each other's.
 *
 * References are not enumerated. `rewriteIds` above says why, and what the
 * enumeration cost when it went stale. Unknown references, a chunk citation
 * the model invented among them, pass through unchanged: they were dangling
 * in the study this bundle came from and importing does not mend them.
 */
export function remapBundleIds(
  bundle: ProjectBundle,
  makeId: () => string = () => crypto.randomUUID(),
): ProjectBundle {
  const map = new Map<string, string>();
  const fresh = (oldId: string): string => {
    const next = makeId();
    map.set(oldId, next);
    return next;
  };

  const projectId = fresh(bundle.project.id);
  for (const doc of bundle.documents) fresh(doc.id);
  for (const chunk of bundle.chunks) fresh(chunk.id);
  for (const anomaly of bundle.anomalies) fresh(anomaly.id);
  if (bundle.twin !== null) fresh(bundle.twin.id);
  for (const event of bundle.events) fresh(event.id);

  return {
    format: "bounds-bundle",
    version: 1,
    project: { ...bundle.project, id: projectId },
    documents: bundle.documents.map((doc) => ({
      ...doc,
      id: mapId(map, doc.id),
      projectId,
    })),
    chunks: bundle.chunks.map((chunk) => ({
      ...chunk,
      id: mapId(map, chunk.id),
      projectId,
      documentId: mapId(map, chunk.documentId),
    })),
    anomalies: bundle.anomalies.map((anomaly) => ({
      ...anomaly,
      id: mapId(map, anomaly.id),
      projectId,
      supportingChunks: anomaly.supportingChunks.map((id) => mapId(map, id)),
      survivingDissent: anomaly.survivingDissent.map((id) => mapId(map, id)),
    })),
    twin:
      bundle.twin === null
        ? null
        : { ...bundle.twin, id: mapId(map, bundle.twin.id), projectId },
    events: bundle.events.map((event) => remapEvent(event, map, projectId)),
  };
}

// ---------------------------------------------------------------------------
// Import (injectable persistence)
// ---------------------------------------------------------------------------

export interface BundleStores {
  readonly saveProject: (project: Project) => Promise<void>;
  readonly saveDocument: (doc: StoredDocument) => Promise<void>;
  readonly saveChunks: (chunks: readonly Chunk[]) => Promise<void>;
  readonly saveAnomaly: (anomaly: AnomalyCandidate) => Promise<void>;
  readonly saveTwin: (twin: ModalTwin) => Promise<void>;
  readonly appendEvents: (events: readonly LedgerEvent[]) => Promise<void>;
}

/**
 * Persist a (parsed, optionally remapped) bundle through the provided stores.
 * Returns the imported project. Content is written verbatim, so round-tripping
 * an imported project back through `buildBundle` deep-equals the input.
 */
export async function importBundle(
  bundle: ProjectBundle,
  stores: BundleStores,
): Promise<Project> {
  await stores.saveProject(bundle.project);
  for (const doc of bundle.documents) await stores.saveDocument(doc);
  await stores.saveChunks(bundle.chunks);
  for (const anomaly of bundle.anomalies) await stores.saveAnomaly(anomaly);
  if (bundle.twin !== null) await stores.saveTwin(bundle.twin);
  await stores.appendEvents(bundle.events);
  return bundle.project;
}

export function downloadBundle(bundle: ProjectBundle): void {
  downloadText(
    `${slugify(bundle.project.title)}-bundle.json`,
    serializeBundle(bundle),
    "application/json",
  );
}
