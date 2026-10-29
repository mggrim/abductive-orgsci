/**
 * The ledger survives a transaction that WebKit aborts (M73, ISC-658).
 *
 * Safari, 2026-10-02, on a step with Abductive's question open: the ledger's
 * `add` for the save's `bound` row failed with "UnknownError: Attempt to
 * generate key in database without an in-progress transaction", the
 * transaction aborted, and a `getAll` on the same store aborted with no error.
 * Nothing had been written, so the store tries again in a fresh transaction.
 */
import "fake-indexeddb/auto";
import { afterEach, describe, expect, test } from "bun:test";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { IndexedDBLedgerStore } from "../src/ledger/ledger.ts";
import { emptyBrief, getProject, saveProject, updateBrief, type Project } from "../src/state/projects.ts";

const proto = (globalThis as unknown as { IDBDatabase: { prototype: IDBDatabase } }).IDBDatabase.prototype;
const realTransaction = proto.transaction;
afterEach(() => {
  proto.transaction = realTransaction;
});

/** Abort the next `count` transactions of `mode` on the ledger the moment they open, as WebKit did. */
function abortNext(mode: IDBTransactionMode, count: number) {
  let left = count;
  proto.transaction = function (this: IDBDatabase, ...args: Parameters<IDBDatabase["transaction"]>) {
    const tx = realTransaction.apply(this, args);
    if ((args[1] ?? "readonly") === mode && left > 0) {
      left -= 1;
      queueMicrotask(() => tx.abort());
    }
    return tx;
  } as IDBDatabase["transaction"];
}

let n = 0;
const bound = (): LedgerEvent =>
  ({
    id: crypto.randomUUID(),
    ts: 1_790_000_000_000 + (n += 1),
    actor: "human",
    projectId: "m73-retry",
    type: "bound",
    subject: "context",
    statement: "Repair cafes where volunteers decide what is worth fixing.",
  }) as LedgerEvent;

describe("an aborted ledger transaction is tried again (ISC-658)", () => {
  test("an append whose first transaction aborts is stored once", async () => {
    const store = new IndexedDBLedgerStore(`m73-append-${crypto.randomUUID()}`);
    await store.readAll();
    const event = bound();
    abortNext("readwrite", 1);
    await store.append(event);
    proto.transaction = realTransaction;
    const all = await store.readAll("m73-retry");
    expect(all.map((e) => e.id)).toEqual([event.id]);
  });

  test("a read whose first transaction aborts still returns the events", async () => {
    const store = new IndexedDBLedgerStore(`m73-read-${crypto.randomUUID()}`);
    const event = bound();
    await store.append(event);
    abortNext("readonly", 1);
    const all = await store.readAll("m73-retry");
    expect(all.map((e) => e.id)).toEqual([event.id]);
  });

  test("a store that keeps failing says so rather than retrying for ever", async () => {
    const store = new IndexedDBLedgerStore(`m73-fail-${crypto.randomUUID()}`);
    await store.readAll();
    abortNext("readwrite", 10);
    await expect(store.append(bound())).rejects.toBeDefined();
  });

  test("a duplicate id is still refused, and is not mistaken for an abort", async () => {
    const store = new IndexedDBLedgerStore(`m73-dup-${crypto.randomUUID()}`);
    const event = bound();
    await store.append(event);
    await expect(store.append(event)).rejects.toBeDefined();
    expect((await store.readAll("m73-retry")).length).toBe(1);
  });
});

describe("the brief's write survives the same abort (ISC-658)", () => {
  /* Safari, the same afternoon, with the record written first: the projects
   * store's put aborted with "Attempt to delete range from database without an
   * in-progress transaction". */
  test("an updateBrief whose first transaction aborts writes the field once", async () => {
    const id = `m73-brief-${crypto.randomUUID()}`;
    await saveProject({ id, title: "Repair cafes", stage: "design-brief", createdAt: 1, brief: emptyBrief() } as Project);
    abortNext("readwrite", 1);
    const written = await updateBrief(id, { context: "Repair cafes where volunteers decide." });
    proto.transaction = realTransaction;
    expect(written?.changed).toBe(true);
    expect(written?.before.context).toBe("");
    expect((await getProject(id))?.brief.context).toBe("Repair cafes where volunteers decide.");
  });

  test("an updateBrief that keeps failing rejects", async () => {
    const id = `m73-brief-fail-${crypto.randomUUID()}`;
    await saveProject({ id, title: "Repair cafes", stage: "design-brief", createdAt: 1, brief: emptyBrief() } as Project);
    abortNext("readwrite", 10);
    const failed = await updateBrief(id, { context: "x" }).then(
      () => "resolved",
      (err: unknown) => (err as { name?: string }).name,
    );
    proto.transaction = realTransaction;
    expect(failed).toBe("AbortError");
    expect((await getProject(id))?.brief.context).toBe("");
  });
});
