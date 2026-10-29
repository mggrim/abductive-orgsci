/**
 * Project store (ISC-17, ISC-18).
 *
 * Projects persist in IndexedDB in their own object store, in the same app DB
 * as documents/chunks/anomalies (separate from the ledger DB). The project
 * record holds only the brief + current stage pointer; every stage transition
 * and brief-lock decision is ALSO appended to the ledger as `bound` events —
 * the ledger stays the audit source of truth, the store is the current-state
 * projection the UI reads on load.
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { announce } from "./studyChannel.ts";
import { tryAgainOnAbort } from "../ledger/idbAgain.ts";
import type { StageId } from "../matrix/schema.ts";
import type { AnomalyCandidate } from "./chunks.ts";
import type { Chunk, DocumentKind, StoredDocument } from "./chunks.ts";
import type { ModalTwin } from "../twin/twin.ts";
import type { UnitOfAnalysis } from "../interview/unitOfAnalysis.ts";

export type DataType = "ethnographic" | "interview" | "archival";

export const DATA_TYPES: readonly DataType[] = [
  "ethnographic",
  "interview",
  "archival",
];

/**
 * What the brief holds before the researcher has said which kind (D22, M43b).
 *
 * The empty string is a real state rather than a sentinel standing in for one:
 * nobody has said what this study's material is. `emptyBrief` used to open on
 * `interview`, which is how the walk of 2026-09-13 found an ethnography declared
 * as interview data by a control the researcher had not touched, in a spot they
 * had no reason to look at.
 *
 * The same shape `CorpusMaterial`'s kind picker already uses, and for the same
 * reason its module note gives: `transcript` sat there as a default once, which
 * is how a journal editorial became a transcript.
 */
export type DeclaredDataType = DataType | "";

/**
 * The brief, one field per station (ISC-75). `researchQuestion` predates the
 * station model and is kept under `context` rather than given a station of its
 * own: in early-stage qualitative work the question is what the stations
 * *produce*, and promoting it to a station of equal standing implies it is
 * settled before the rest of the design exists.
 *
 * The four station fields added at M8 are required on the type but absent from
 * every project stored before M8, so nothing reads this interface directly off
 * IndexedDB — reads go through `normalizeBrief` (ISC-76).
 */
export interface ProjectBrief {
  readonly researchQuestion: string;
  readonly context: string;
  readonly siteRationale: string;
  readonly processOfInterest: string;
  readonly outcomeOfInterest: string;
  /**
   * @deprecated Retired at M27 (D3). The challenge and tension stations merged
   * into `bind`, and `normalizeBrief` folds whatever these hold into it on
   * load. They stay on the type, and only on the type, so a bundle exported
   * before M27 still parses; nothing writes to either again.
   */
  readonly challenge: string;
  /** @deprecated Retired at M27 (D3). See `challenge` above. */
  readonly tension: string;
  /**
   * What the people in the setting are caught between (D3).
   *
   * One station where there were two. Filled from `challenge` and `tension` on
   * load when it is empty and either of them is not, so a study designed
   * before M27 opens with everything it had said at both.
   */
  readonly bind: string;
  readonly sampleRationale: string;
  /**
   * What the material has already shown the researcher that they did not
   * expect (D5, ISC-489).
   *
   * The Early data step asked this and had nowhere to put the answer: it was
   * the one station mapped to no field at all, on the reasoning that its
   * content is the corpus. The corpus is half of it. The other half is the
   * only sentence in the whole brief that can only be written after the
   * material has been read, which makes it the tool's best evidence that it
   * has been — and a step that asks a question over no box is a step the
   * researcher learns to walk past.
   *
   * The corpus reading is kept beside it rather than replaced: material
   * uploaded and nothing typed still counts as said at this step. A field or
   * material, either way.
   */
  readonly earlySurprise: string;
  readonly dataType: DeclaredDataType;
  /**
   * The kind of data the researcher chose at Early data, from the list Sources
   * offers for a file (M74b, ISC-665). Optional and additive: `dataType` stays
   * the methods declaration the checks read, set from this kind, and a brief
   * from before M74b shows the kind its `dataType` stands for.
   */
  readonly dataKind?: DocumentKind;
  /**
   * Where the researcher wants this to land. A class of journals rather than
   * one title — "US management journals", "European organisation studies" —
   * because the criteria and the intellectual conversations differ by tradition
   * and knowing which they are writing into is what lets every downstream check
   * be concrete rather than generic.
   *
   * This field predates M18 and fed three mechanisms that nothing ever filled:
   * the persona engine, the twin generator, and the audience-acceptance lint.
   */
  readonly targetVenue?: string;
  /**
   * The three to five papers they are arguing with, in their own words.
   * Pasted or uploaded, never searched for from inside the app: the tool's
   * standing promise is that nothing but a model call leaves the browser.
   *
   * Distinct from chunks, which are the researcher's own material. This is the
   * conversation they intend to join.
   */
  readonly seminalCorpus?: string;
  /**
   * What they are thinking about exploring, before there is a question.
   *
   * Most people do not open with a research question. They open with "I'm
   * interested in technology", or a site they have access to, or a context
   * that simply grips them. Demanding a question first makes them invent one.
   */
  readonly startingInterest?: string;
  /**
   * The researcher's own answer at the puzzle step (M58, ISC-567).
   *
   * Optional, because every study before M58 has none and the shipped example
   * must import unchanged. Not `researchQuestion`, which holds the tool's own
   * reading (M40) and keeps its name for every reader of it.
   */
  readonly puzzleAnswer?: string;
  /**
   * The unit of analysis, chosen at Context (M84, ISC-707): a person, a team, an
   * organisation, a community or a field. Optional and additive, as `dataKind`
   * was at M74b: a brief from before M84 loads without it, and every prompt
   * reads its absence as a unit still to name.
   */
  readonly unit?: UnitOfAnalysis;
  /** The unit that the researcher typed when `unit` is `other` (M92, ISC-749). */
  readonly unitOther?: string;
}

export function emptyBrief(dataType: DeclaredDataType = ""): ProjectBrief {
  return {
    researchQuestion: "",
    context: "",
    siteRationale: "",
    processOfInterest: "",
    outcomeOfInterest: "",
    challenge: "",
    tension: "",
    bind: "",
    sampleRationale: "",
    earlySurprise: "",
    dataType,
  };
}

/**
 * Fill in fields a stored brief predates (ISC-76). Projects created before M8
 * have four of the station fields missing entirely; without this they render
 * as `undefined` in a textarea, which React treats as uncontrolled and which
 * then throws the moment the researcher types into it.
 *
 * It also folds the two retired fields into the station that replaced them
 * (D3). A study designed before M27 answered `challenge` and `tension`
 * separately, and dropping either would be the tool discarding something the
 * researcher wrote. Both are kept, in the order they were asked, separated by
 * a blank line so the join is visible rather than run together.
 *
 * The merge is what carries every field added since, `earlySurprise` among
 * them (D5): a study or a bundle written before it holds no such key, and the
 * spread over `emptyBrief()` gives it the empty string rather than the
 * `undefined` that would make React drop the box out of controlled state the
 * moment the researcher typed into it.
 *
 * The fold is conditional on `bind` being empty, which makes it idempotent: it
 * runs on the first load after the migration and never again, so a researcher
 * who then edits `bind` does not find the old text pasted back underneath.
 */
export function normalizeBrief(brief: Partial<ProjectBrief> | undefined): ProjectBrief {
  const merged = { ...emptyBrief(), ...brief };
  if (merged.bind.trim() !== "") return merged;
  const folded = [merged.challenge, merged.tension]
    .map((value) => value.trim())
    .filter((value) => value !== "")
    .join("\n\n");
  return folded === "" ? merged : { ...merged, bind: folded };
}

function normalizeProject(project: Project): Project {
  return { ...project, brief: normalizeBrief(project.brief) };
}

/**
 * Which door a study came in through, when it did not start as a blank one.
 *
 * `bundle` is a file the researcher chose; `example` is a copy of the example
 * project the front page offered until M91. The owner removed the example on
 * 2026-10-14 and nothing writes `example` now, but copies made before then are
 * in researchers' browsers (the owner's and a co-author's among them) and are
 * their data: the value stays in the union so those copies read and open as
 * ordinary projects, and nothing deletes or rewrites them.
 *
 * A field on the project rather than a ledger event. `LedgerEvent` has no
 * member for an import, and every event in a bundle is re-validated against
 * that union on the way in, so a new member would be a schema change to the
 * format every existing bundle was written under. M36 declined to make one.
 *
 * Written by the import, over whatever the file said, so the mark names the
 * door this copy came through rather than the door the copy before it did.
 * Absent on every study created by naming one, which is most of them.
 */
export type StudyOrigin = "bundle" | "example";

export interface Project {
  readonly id: string;
  readonly title: string;
  readonly stage: StageId;
  readonly brief: ProjectBrief;
  readonly createdAt: number;
  readonly importedAs?: StudyOrigin;
  /**
   * Which example this is a copy of (D56, M43d).
   *
   * The bundle's own project id, kept before `remapBundleIds` gives the copy
   * fresh ids, so a browser can tell a copy of the example the app ships today
   * from a copy of the one it shipped last month. Without it `importedAs:
   * "example"` was the whole of the test, and a browser holding a copy of
   * Gleanline opened Gleanline under a control describing Coldharbour.
   *
   * Only ever set on a copy of the example. Absent on a study created by naming
   * one, on a bundle a colleague sent, and on every copy imported before this
   * field existed, and the last of those is why an absent value reads as some
   * other example rather than as this one.
   *
   * M91 (2026-10-14): the example left the product and nothing writes this
   * now. It stays on the type so the copies already stored read unchanged.
   */
  readonly exampleId?: string;
  /**
   * When the researcher said they already have some initial data (M49, ISC-529).
   *
   * Material opens on the papers alone. A co-author's first use, 2026-09-21:
   * most studies that come to this tool have no data yet, and a tab that opens
   * on an empty data pane with five counts on it teaches a first-time
   * researcher that the tool is about files. The data section is behind one
   * control, and pressing it is the act this field records.
   *
   * A field on the project rather than a ledger event, for the reason
   * `importedAs` above gives: `LedgerEvent` has no member for it, every event in
   * a bundle is re-validated against that union on the way in, and a new member
   * would be a schema change to the format every existing bundle was written
   * under. The bundle spreads the whole project record, so this travels with a
   * study a co-author sends without the format changing at all.
   *
   * A timestamp rather than a flag, because what is recorded is an act with a
   * time, and the surfaces that read it only ever ask whether it happened.
   *
   * Absent on every study written before this field, which is why nothing reads
   * it alone: a study that holds data has its data section open whatever this
   * says, so the shipped example and every bundle already carrying material open
   * the way they always did.
   */
  readonly dataDeclaredAt?: number;
}

/**
 * The visible workspace stages (design-brief → data → anomaly-hunt, ISC-17)
 * mapped onto matrix StageIds so the trigger engine fires on the right cells.
 */
export interface WorkspaceStage {
  readonly stage: StageId;
  readonly label: string;
}

export const WORKSPACE_STAGES: readonly WorkspaceStage[] = [
  { stage: "design-brief", label: "Design Brief" },
  { stage: "pilot-data", label: "Data" },
  { stage: "anomaly", label: "Anomaly Hunt" },
];

export function nextStage(current: StageId): StageId | undefined {
  const idx = WORKSPACE_STAGES.findIndex((s) => s.stage === current);
  return idx >= 0 ? WORKSPACE_STAGES[idx + 1]?.stage : undefined;
}

export function stageLabel(stage: StageId): string {
  return WORKSPACE_STAGES.find((s) => s.stage === stage)?.label ?? stage;
}

// ---------------------------------------------------------------------------
// IndexedDB app store (projects + documents + chunks + anomalies)
// ---------------------------------------------------------------------------

interface AppDB extends DBSchema {
  projects: { key: string; value: Project };
  documents: {
    key: string;
    value: StoredDocument;
    indexes: { byProject: string };
  };
  chunks: {
    key: string;
    value: Chunk;
    indexes: { byProject: string; byDocument: string };
  };
  anomalies: {
    key: string;
    value: AnomalyCandidate;
    indexes: { byProject: string };
  };
  twins: {
    key: string;
    value: ModalTwin;
    indexes: { byProject: string };
  };
}

const DB_NAME = "qual-design-app";
// v2: adds the 'twins' object store (modal baseline, ISC-30). The upgrade
// callback is oldVersion-gated so existing v1 databases only gain the new
// store and fresh installs create everything.
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<AppDB>> | null = null;

function db(): Promise<IDBPDatabase<AppDB>> {
  dbPromise ??= openDB<AppDB>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore("projects", { keyPath: "id" });
        const docs = database.createObjectStore("documents", { keyPath: "id" });
        docs.createIndex("byProject", "projectId");
        const chunks = database.createObjectStore("chunks", { keyPath: "id" });
        chunks.createIndex("byProject", "projectId");
        chunks.createIndex("byDocument", "documentId");
        const anomalies = database.createObjectStore("anomalies", { keyPath: "id" });
        anomalies.createIndex("byProject", "projectId");
      }
      if (oldVersion < 2) {
        const twins = database.createObjectStore("twins", { keyPath: "id" });
        twins.createIndex("byProject", "projectId");
      }
    },
  });
  return dbPromise;
}

export async function saveProject(project: Project): Promise<void> {
  await (await db()).put("projects", project);
}

/**
 * The four framing fields, and every other field a surface owns a slice of.
 *
 * A brief is written from four places: the framing band on Design, the papers
 * field on Material, a station's own box, and a bundle import. Three of the
 * four did the same thing, which was to hold a copy of the whole project from
 * whenever they last loaded it and write that copy back with one field
 * changed. Every field somebody else had written since that load went back to
 * what it was at load time, silently, with no error and no conflict.
 *
 * That is how a venue typed on Design disappears when the papers list is saved
 * on Material, and how a second browser tab open on the same study reverts
 * whatever the first one just wrote. There is no version to compare and no
 * merge: last writer wins, and the thing it wins with is old.
 *
 * So no surface writes a whole brief any more. A surface says which fields it
 * owns and what they now hold, and the read and the write happen inside one
 * IndexedDB transaction, which is the only place a read-modify-write on this
 * store can be made safe. Everything the caller did not name keeps whatever is
 * on disk at the moment of writing, whoever put it there.
 */
export type BriefPatch = { readonly [K in keyof ProjectBrief]?: ProjectBrief[K] | undefined };

/**
 * The brief a patch makes of a stored one: the rule `updateBrief` writes by,
 * stated once so a caller can know the result before it writes (M73).
 *
 * Undefined means "I am not writing this field", which is not the same as
 * writing an empty string. A surface that clears a box sends "".
 */
export function applyBriefPatch(before: ProjectBrief, fields: BriefPatch): ProjectBrief {
  const named = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<ProjectBrief>;
  return { ...before, ...named };
}

export async function updateBrief(
  projectId: string,
  fields: BriefPatch,
): Promise<{
  readonly before: ProjectBrief;
  readonly after: ProjectBrief;
  readonly changed: boolean;
} | undefined> {
  const database = await db();
  /* Read and write in one transaction, tried again whole when WebKit aborts it
   * (M73, see `idbAgain.ts`): the retry re-reads, so it merges onto what is
   * stored then. `tx.done` is awaited with the put so an abort is one rejection. */
  const result = await tryAgainOnAbort(async () => {
    const tx = database.transaction("projects", "readwrite");
    const done = tx.done;
    try {
      const found = await tx.store.get(projectId);
      if (found === undefined) {
        await done;
        return undefined;
      }
      const stored = normalizeProject(found);
      const before = stored.brief;
      const after = applyBriefPatch(before, fields);
      const changed = JSON.stringify(after) !== JSON.stringify(before);
      if (changed) await tx.store.put({ ...stored, brief: after });
      await done;
      return { before, after, changed };
    } catch (err) {
      done.catch(() => undefined);
      throw err;
    }
  });
  if (result === undefined) return undefined;
  const { before, after, changed } = result;
  /* Tell the other tabs (walk finding). A framing change writes no ledger event
   * of its own when it is the venue or the papers list, so the ledger channel
   * would not carry it and a second tab would go on showing a brief that is no
   * longer what is stored. */
  if (changed) announce({ projectId, kind: "project" });
  return { before, after, changed };
}

/**
 * Record that the researcher has some initial data (M49, ISC-529).
 *
 * Inside one transaction, and idempotent: a second press keeps the first time,
 * because what the field records is when they said so rather than when they
 * last pressed. Returns the stored project so a caller can render off the value
 * that landed rather than off an optimistic guess.
 */
export async function declareEarlyData(
  projectId: string,
  at: number = Date.now(),
): Promise<Project | undefined> {
  const database = await db();
  const tx = database.transaction("projects", "readwrite");
  const found = await tx.store.get(projectId);
  if (found === undefined) {
    await tx.done;
    return undefined;
  }
  const stored = normalizeProject(found);
  if (stored.dataDeclaredAt !== undefined) {
    await tx.done;
    return stored;
  }
  const next: Project = { ...stored, dataDeclaredAt: at };
  await tx.store.put(next);
  await tx.done;
  /* The same announcement `updateBrief` makes, and for the same reason: this
   * write appends no ledger event, so the ledger channel would not carry it and
   * a second tab open on the study would go on showing a closed data section. */
  announce({ projectId, kind: "project" });
  return next;
}

export async function getProject(id: string): Promise<Project | undefined> {
  const found = await (await db()).get("projects", id);
  return found === undefined ? undefined : normalizeProject(found);
}

export async function listProjects(): Promise<readonly Project[]> {
  const all = await (await db()).getAll("projects");
  return all.map(normalizeProject).sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveDocument(doc: StoredDocument): Promise<void> {
  await (await db()).put("documents", doc);
}

export async function listDocuments(
  projectId: string,
): Promise<readonly StoredDocument[]> {
  return (await db()).getAllFromIndex("documents", "byProject", projectId);
}

export async function saveChunks(chunks: readonly Chunk[]): Promise<void> {
  const database = await db();
  const tx = database.transaction("chunks", "readwrite");
  await Promise.all(chunks.map((chunk) => tx.store.put(chunk)));
  await tx.done;
}

export async function listChunks(projectId: string): Promise<readonly Chunk[]> {
  const all = await (await db()).getAllFromIndex("chunks", "byProject", projectId);
  return all.sort(
    (a, b) => a.documentId.localeCompare(b.documentId) || a.index - b.index,
  );
}

/**
 * Take one document and its passages out of storage (M29c, item 5).
 *
 * Until this there was no way to remove a file at all: a paper dropped on the
 * wrong tab, or a transcript uploaded twice, was permanent, counted in every
 * total and read by every pass.
 *
 * One transaction over both stores, because a document whose passages survived
 * it would leave orphan chunks that every count on the Material tab would keep
 * reporting against a file the researcher can no longer see. The caller appends
 * the `document-removed` event: storage forgets, and the record does not.
 */
export async function deleteDocument(documentId: string): Promise<void> {
  const database = await db();
  const tx = database.transaction(["documents", "chunks"], "readwrite");
  await tx.objectStore("documents").delete(documentId);
  const idx = tx.objectStore("chunks").index("byDocument");
  for (const key of await idx.getAllKeys(documentId)) {
    await tx.objectStore("chunks").delete(key);
  }
  await tx.done;
}

export async function saveAnomaly(anomaly: AnomalyCandidate): Promise<void> {
  await (await db()).put("anomalies", anomaly);
}

export async function listAnomalies(
  projectId: string,
): Promise<readonly AnomalyCandidate[]> {
  return (await db()).getAllFromIndex("anomalies", "byProject", projectId);
}

/** Store the modal baseline twin (ISC-30). Storage only — display is gated elsewhere. */
export async function saveTwin(twin: ModalTwin): Promise<void> {
  await (await db()).put("twins", twin);
}

export async function getTwinByProject(
  projectId: string,
): Promise<ModalTwin | undefined> {
  return (await db()).getFromIndex("twins", "byProject", projectId);
}

/**
 * Delete a project and its owned artifacts (documents, chunks, anomalies,
 * twin). Ledger events are deliberately retained — the ledger is append-only
 * and project-scoped events of deleted projects are simply orphaned history.
 */
export async function deleteProject(projectId: string): Promise<void> {
  const database = await db();
  const tx = database.transaction(
    ["projects", "documents", "chunks", "anomalies", "twins"],
    "readwrite",
  );
  await tx.objectStore("projects").delete(projectId);
  for (const store of ["documents", "chunks", "anomalies", "twins"] as const) {
    const idx = tx.objectStore(store).index("byProject");
    for (const key of await idx.getAllKeys(projectId)) {
      await tx.objectStore(store).delete(key);
    }
  }
  await tx.done;
}
