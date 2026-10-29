/**
 * Unsaved edits at Starting point (M78b, ISC-681).
 *
 * Starting point saved a field when it lost focus, so on the serendipity walk an
 * edited summary was saved by leaving it, and a researcher who edited the last
 * field and went straight to another tab couldn't tell whether the edit stayed.
 * A field now saves on Save answer, as a Design step does. Until then the edit
 * is a draft: it stays in the field when the researcher leaves it, it comes back
 * when they return to the tab, and the tab strip marks the tab with a dot.
 *
 * The draft lives in this browser's localStorage, keyed by project, because it
 * is the viewer's own unsaved text and nobody else's. Every read and write is
 * guarded: a private window or blocked storage keeps the edit for the visit only.
 */

import { useEffect, useState } from "react";

/** The three Starting point fields, by their brief keys. */
export type UnsavedField = "startingInterest" | "seminalCorpus" | "targetVenue";
export type UnsavedEdits = Partial<Record<UnsavedField, string>>;

const KEY = (projectId: string) => `abductive:unsaved-starting-point:${projectId}`;
const EVENT = "abductive:unsaved-edits";
/** The visit's own copy, for when storage is blocked. */
const memory = new Map<string, UnsavedEdits>();

export function readUnsaved(projectId: string): UnsavedEdits {
  try {
    const raw = globalThis.localStorage?.getItem(KEY(projectId));
    if (raw !== null && raw !== undefined) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed !== null && typeof parsed === "object") return parsed as UnsavedEdits;
    }
  } catch {
    /* Storage blocked or the value unreadable: the visit's copy stands in. */
  }
  return memory.get(projectId) ?? {};
}

function writeAll(projectId: string, edits: UnsavedEdits): void {
  const empty = Object.keys(edits).length === 0;
  if (empty) memory.delete(projectId);
  else memory.set(projectId, edits);
  try {
    if (empty) globalThis.localStorage?.removeItem(KEY(projectId));
    else globalThis.localStorage?.setItem(KEY(projectId), JSON.stringify(edits));
  } catch {
    /* The visit's copy keeps the edit. */
  }
  try {
    globalThis.dispatchEvent?.(new CustomEvent(EVENT, { detail: projectId }));
  } catch {
    /* A runtime without events: the next render reads the store. */
  }
}

/** Keep `text` as the field's unsaved edit, or drop the edit when `text` is undefined. */
export function setUnsaved(projectId: string, field: UnsavedField, text: string | undefined): void {
  const edits: UnsavedEdits = { ...readUnsaved(projectId) };
  if (text === undefined) {
    if (!(field in edits)) return;
    delete edits[field];
  } else {
    if (edits[field] === text) return;
    edits[field] = text;
  }
  writeAll(projectId, edits);
}

export function hasUnsaved(projectId: string): boolean {
  return Object.keys(readUnsaved(projectId)).length > 0;
}

/** Whether Starting point holds an unsaved edit, kept current as fields change. */
export function useHasUnsaved(projectId: string): boolean {
  const [has, setHas] = useState(() => hasUnsaved(projectId));
  useEffect(() => {
    setHas(hasUnsaved(projectId));
    const on = () => setHas(hasUnsaved(projectId));
    globalThis.addEventListener?.(EVENT, on);
    globalThis.addEventListener?.("storage", on);
    return () => {
      globalThis.removeEventListener?.(EVENT, on);
      globalThis.removeEventListener?.("storage", on);
    };
  }, [projectId]);
  return has;
}
