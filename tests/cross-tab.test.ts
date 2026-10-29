/**
 * A study open in two tabs (walk finding).
 *
 * Thirteen drafts accepted and a relation recorded in one tab; the other, on
 * Your model, went on showing seventeen drafts and "Nothing in your model yet"
 * through every hash navigation until a hard reload. Neither tab had a wrong
 * idea of what it had read: the ledger is read into memory once when a tab
 * loads and re-read only after that tab's own appends.
 *
 * The store underneath is shared, so nothing travels between tabs but the news
 * that something changed. Each tab then re-reads, which is a merge rather than
 * a replace: an event is written once under its own id, and the store holds the
 * union of both tabs' appends.
 */

import "fake-indexeddb/auto";
import { describe, expect, test } from "bun:test";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import { makeStudyChannel, type StudyChange } from "../src/state/studyChannel.ts";
import { emptyBrief, getProject, saveProject, updateBrief } from "../src/state/projects.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";

const P = "cccccccc-3333-4333-8333-cccccccccccc";
let seq = 0;
const uid = () => `cccccccc-3333-4333-8333-${String((seq += 1)).padStart(12, "0")}`;
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function draft(title: string): LedgerEvent {
  return {
    id: uid(),
    ts: (seq += 1),
    actor: "human",
    projectId: P,
    type: "proposal",
    proposalId: uid(),
    pageType: "observation",
    title,
    sourceChunks: [],
  } as LedgerEvent;
}

/**
 * One tab: its own in-memory view of the shared store, its own channel.
 *
 * The React provider is this loop with `setEvents` in place of the assignment.
 * Driving it here rather than through a rendered tree keeps the test about the
 * thing that was broken, which is when a tab decides to read again.
 */
function tab(store: InMemoryLedgerStore, name: string) {
  const channel = makeStudyChannel(name);
  let events: readonly LedgerEvent[] = [];
  const reread = async () => {
    events = await store.readAll();
  };
  const heard: StudyChange[] = [];
  channel.subscribe((change) => {
    heard.push(change);
    void reread();
  });
  return {
    heard,
    events: () => events,
    load: reread,
    append: async (batch: readonly LedgerEvent[]) => {
      for (const event of batch) await store.append(event);
      await reread();
      for (const projectId of new Set(batch.map((e) => e.projectId))) {
        channel.post({ projectId, kind: "events" });
      }
    },
    close: () => channel.close(),
  };
}

describe("two tabs, one study", () => {
  test("a tab sees what another tab wrote, without a reload", async () => {
    const store = new InMemoryLedgerStore();
    const name = `t-${(seq += 1)}`;
    const a = tab(store, name);
    const b = tab(store, name);
    await a.load();
    await b.load();
    expect(b.events().length).toBe(0);

    await a.append([draft("the sister rewrote the form"), draft("two wards never used it")]);
    await wait(5);

    expect(b.events().length).toBe(2);
    expect(b.heard).toEqual([{ projectId: P, kind: "events" }]);
    a.close();
    b.close();
  });

  test("a tab does not re-read on its own write", async () => {
    // A tab reacting to its own announcement is a loop, and the re-read it
    // already does after appending is the one that matters.
    const store = new InMemoryLedgerStore();
    const a = tab(store, `t-${(seq += 1)}`);
    await a.load();
    await a.append([draft("one")]);
    await wait(5);
    expect(a.heard).toEqual([]);
    a.close();
  });

  test("the re-read merges by event id: a tab that missed a write keeps both", async () => {
    /* The property the lead asked to confirm. Nothing is replaced, because the
     * shared store is the union and an event is appended once under its own id.
     * Tab B is deaf here, standing in for a tab whose channel never delivered. */
    const store = new InMemoryLedgerStore();
    const a = tab(store, `t-${(seq += 1)}`);
    const b = tab(store, `t-other-${seq}`);
    await a.load();
    await b.load();

    await a.append([draft("written in tab A")]);
    await wait(5);
    // B never heard it, and now writes something of its own.
    expect(b.events().length).toBe(0);
    await b.append([draft("written in tab B")]);

    const titles = b.events().map((e) => (e as { title?: string }).title);
    expect(titles).toEqual(["written in tab A", "written in tab B"]);
    // And the store holds one copy of each, not a replacement.
    expect((await store.readAll()).length).toBe(2);
    a.close();
    b.close();
  });

  test("a brief written in one tab announces itself, so the other reloads it", async () => {
    /* The framing fields write no ledger event of their own when they are the
     * venue or the papers list, so the ledger's own channel traffic would not
     * carry them and a second tab would go on showing a stored brief that is
     * no longer stored. */
    const id = `cross-${(seq += 1)}`;
    await saveProject({
      id,
      title: "night wards",
      stage: "design-brief",
      createdAt: 1,
      brief: { ...emptyBrief() },
    } as never);

    const heard: StudyChange[] = [];
    const listener = makeStudyChannel();
    listener.subscribe((change) => heard.push(change));

    await updateBrief(id, { targetVenue: "A US management journal" });
    await wait(5);

    expect(heard).toEqual([{ projectId: id, kind: "project" }]);
    expect((await getProject(id))?.brief.targetVenue).toBe("A US management journal");
    listener.close();
  });

  test("Anti: a write that changed nothing tells nobody", async () => {
    const id = `cross-${(seq += 1)}`;
    await saveProject({
      id,
      title: "night wards",
      stage: "design-brief",
      createdAt: 1,
      brief: { ...emptyBrief(), targetVenue: "ASQ" },
    } as never);
    const heard: StudyChange[] = [];
    const listener = makeStudyChannel();
    listener.subscribe((change) => heard.push(change));
    await updateBrief(id, { targetVenue: "ASQ" });
    await wait(5);
    expect(heard).toEqual([]);
    listener.close();
  });

  test("Anti: anything that is not a study change is ignored", async () => {
    // The channel has a name, and another version of the app could be using it.
    const name = `t-${(seq += 1)}`;
    const heard: StudyChange[] = [];
    const listener = makeStudyChannel(name);
    listener.subscribe((change) => heard.push(change));
    const other = new BroadcastChannel(name);
    other.postMessage({ hello: "world" });
    other.postMessage({ projectId: P, kind: "events" });
    await wait(5);
    expect(heard).toEqual([{ projectId: P, kind: "events" }]);
    other.close();
    listener.close();
  });
});

describe("the surfaces subscribe", () => {
  const SRC = new URL("../src/", import.meta.url).pathname;

  test("the ledger re-reads on a remote write, and the pages reload their project", async () => {
    const ledger = await Bun.file(`${SRC}state/ledgerContext.tsx`).text();
    expect(ledger).toContain("channel.subscribe(");
    expect(ledger).toContain('kind: "events"');
    for (const file of ["workbench/Workbench.tsx", "ui/StudyViews.tsx"]) {
      const code = await Bun.file(SRC + file).text();
      expect({ file, fresh: code.includes("useStudyFreshness(") }).toEqual({ file, fresh: true });
    }
  });
});
