/**
 * M71: Delete project on the Projects page, visible at rest (ISC-650, ISC-651).
 *
 * The owner, 2026-10-02: "How do I remove a project? There should be an option
 * to remove the project and then a confirmation." A delete existed only as a
 * faint bare "Delete" at the far right of the projects table, and the owner did
 * not find it. The owner then narrowed the milestone to this page: each row's
 * control is a quiet button labelled "Delete project", visible at rest, with
 * the existing confirmation row, and a delete leaves the researcher on the
 * Projects page with "Deleted <title>." under the summary line.
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { describe, expect, test } from "bun:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

const SRC = new URL("../src/", import.meta.url).pathname;
const projects = await import(`${SRC}state/projects.ts`);
const list = await import(`${SRC}ui/ProjectList.tsx`);
const { ProjectList, StudyRow } = list;
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);
const { InMemoryLedgerStore } = await import(`${SRC}ledger/ledger.ts`);

let n = 0;
const uid = () => `71717171-0000-4000-8000-${String((n += 1)).padStart(12, "0")}`;

async function makeProject(title: string) {
  const project = { id: uid(), title, stage: "design-brief", createdAt: Date.now(), brief: projects.emptyBrief() };
  await projects.saveProject(project as never);
  return project;
}

async function exists(id: string): Promise<boolean> {
  return (await projects.listProjects()).some((p: { id: string }) => p.id === id);
}

/** The React props on a node, so a control is driven through its own handler. */
function press(el: Element | null | undefined): void {
  if (el === null || el === undefined) throw new Error("no such control");
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  if (key === undefined) throw new Error("no react props");
  (el as never as Record<string, { onClick?: () => void }>)[key]?.onClick?.();
}

const buttonSaying = (scope: ParentNode, text: string) =>
  [...scope.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === text);

async function settle(): Promise<void> {
  await act(async () => {
    await wait(40);
  });
}

async function mountList(): Promise<{ host: HTMLElement; root: Root }> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(
        LedgerProvider as never,
        { store: new InMemoryLedgerStore() } as never,
        React.createElement(ProjectList as never),
      ),
    );
  });
  await settle();
  return { host, root };
}

const STATE = {
  project: { id: "m71-row", title: "M71 row", stage: "design-brief", createdAt: 1, brief: projects.emptyBrief() },
  statements: 0,
  concepts: 0,
  relations: 0,
  staged: 0,
  issues: 0,
  uncited: 0,
  turns: 0,
  questionOnTable: false,
  stations: [],
  answered: 0,
  touchedAt: 1,
};

const rowMarkup = (armed: boolean) =>
  renderToStaticMarkup(
    React.createElement(
      "table",
      null,
      React.createElement(
        "tbody",
        null,
        React.createElement(StudyRow, {
          row: STATE as never,
          armed,
          onArm: () => {},
          onCancel: () => {},
          onRemove: () => {},
        }),
      ),
    ),
  );

// ---------------------------------------------------------------------------

describe("ISC-650: the row control reads Delete project and is visible at rest", () => {
  test("a quiet button with a three-word label, not faint text", async () => {
    const html = rowMarkup(false);
    const button = /<button[^>]*study-remove[^>]*>([\s\S]*?)<\/button>/.exec(html);
    expect(button?.[0]).toContain("btn-quiet");
    expect(button?.[0]).not.toContain("btn-bare");
    expect(button?.[0]).not.toContain("btn-danger");
    expect(button?.[1]?.replace(/<[^>]+>/g, "").startsWith("Delete project")).toBe(true);
    const css = await Bun.file(`${SRC}ui/styles/shell.css`).text();
    const rule = /\.study-remove \{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(rule).not.toContain("--ink-faint");
  });

  test("it sits in the project cell, so the table needs no eighth column", () => {
    // Walk of 2026-10-02 at a 1398px window: the eight columns summed to 852px
    // in a 742px pane, and the last one, where the control was, sat behind the
    // table's own scrollbar. The other seven already take 717px, so no width of
    // button fits there; the project cell is where the row is read from anyway.
    const html = rowMarkup(true);
    const firstRow = /<tr class="study-row"[\s\S]*?<\/tr>/.exec(html)?.[0] ?? "";
    const cell = /<th scope="row">([\s\S]*?)<\/th>/.exec(firstRow)?.[1] ?? "";
    expect(cell).toContain("study-remove");
    expect(firstRow).not.toContain("study-act");
    // M84, ISC-705: the Messages column went. M89: the Flags column went too,
    // so four cells and a colspan of five.
    expect([...firstRow.matchAll(/<td/g)]).toHaveLength(4);
    expect(html).toMatch(/colspan="5"/i);
  });
});

// ---------------------------------------------------------------------------

describe("ISC-651: the confirmation, and where a delete leaves the researcher", () => {
  test("the confirmation names the project, says what goes and what stays, and offers two buttons", () => {
    const html = rowMarkup(true).replaceAll("&#x27;", "'");
    const confirm = /<tr class="study-confirm"[\s\S]*?<\/tr>/.exec(html)?.[0] ?? "";
    expect(confirm).toContain("Delete <strong>M71 row</strong>?");
    expect(confirm).toContain("The project's documents and passages go with it");
    expect(confirm).toContain("The events from this project stay in History.");
    expect(confirm).toMatch(/<button[^>]*btn-danger[^>]*>Delete project<\/button>/);
    expect(confirm).toMatch(/<button[^>]*>Cancel<\/button>/);
  });

  test("the status line after a delete is L9's register: what happened, to what", () => {
    expect(list.deletedLine("Night wards")).toBe("Deleted Night wards.");
  });

  test("Cancel closes the row and keeps the project", async () => {
    const p = await makeProject("M71 table cancel");
    window.location.hash = "#/studies";
    const { host, root } = await mountList();
    const row = [...host.querySelectorAll('[data-testid="study-row"]')].find((r) => r.textContent?.includes(p.title));
    await act(async () => press(row?.querySelector(".study-remove")));
    const confirm = host.querySelector('[data-testid="study-confirm"]')!;
    await act(async () => press(buttonSaying(confirm, "Cancel")));
    await settle();
    expect(host.querySelector('[data-testid="study-confirm"]')).toBeNull();
    expect(await exists(p.id)).toBe(true);
    expect(host.querySelector('[data-testid="studies-deleted"]')).toBeNull();
    expect(window.location.hash).toBe("#/studies");
    await act(async () => root.unmount());
    host.remove();
  });

  test("confirming deletes, stays on the page and prints the line; the sidebar is told", async () => {
    const keep = await makeProject("M71 table keep");
    const gone = await makeProject("M71 table gone");
    window.location.hash = "#/studies";
    let told = 0;
    const listen = () => (told += 1);
    document.addEventListener(list.PROJECTS_CHANGED_EVENT, listen);
    const { host, root } = await mountList();
    const rowOf = (title: string) =>
      [...host.querySelectorAll('[data-testid="study-row"]')].find((r) => r.textContent?.includes(title));
    await act(async () => press(rowOf(gone.title)?.querySelector(".study-remove")));
    // One confirmation on screen at a time, as before.
    expect(host.querySelectorAll('[data-testid="study-confirm"]')).toHaveLength(1);
    const confirm = host.querySelector('[data-testid="study-confirm"]')!;
    expect(confirm.textContent).toContain(`Delete ${gone.title}?`);
    await act(async () => press(buttonSaying(confirm, "Delete project")));
    await settle();
    document.removeEventListener(list.PROJECTS_CHANGED_EVENT, listen);
    expect(await exists(gone.id)).toBe(false);
    expect(await exists(keep.id)).toBe(true);
    expect(rowOf(gone.title)).toBeUndefined();
    expect(host.querySelector('[data-testid="studies-deleted"]')?.textContent).toBe(`Deleted ${gone.title}.`);
    expect(window.location.hash).toBe("#/studies");
    expect(told).toBe(1);
    await act(async () => root.unmount());
    host.remove();
  });

  test("the status line takes a line of its own under the heading", async () => {
    // Walk of 2026-10-02: with the paragraph's reading cap the line clamped to
    // 416px and sat beside the Help control instead of wrapping.
    const css = await Bun.file(`${SRC}ui/styles/shell.css`).text();
    const rule = /\.studies-deleted \{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(rule).toContain("flex-basis: 100%");
    expect(rule).toContain("max-width: none");
  });

  test("the sidebar re-reads its list when the page says a project went", async () => {
    // A delete leaves the route where it is, and the rail read the list only on
    // a route change, so it went on listing the deleted project.
    const shell = await Bun.file(`${SRC}ui/AppShell.tsx`).text();
    expect(shell).toContain("document.addEventListener(PROJECTS_CHANGED_EVENT, bump)");
    expect(shell).toContain("}, [route, projectsChanged]);");
  });
});
