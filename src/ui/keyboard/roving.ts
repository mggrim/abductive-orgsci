/**
 * Roving tabindex for the rail and the bias grid (FND-02, FIN-02, ONT-01).
 *
 * The survey measured the failure precisely: the Biases grid presents its 63
 * squares as 63 tab stops or none, and the rail presents eight. A keyboard
 * user reaching the coverage grid on /biases had to press Tab 63 times to get
 * past it, which is the single worst keyboard defect in the product and the
 * reason WAI-ARIA's grid pattern exists. One stop for the group, arrows to
 * move inside it: Tab is for getting past a thing, arrows are for moving
 * within it.
 *
 * The two groups that exist today are matched by selector rather than by an
 * attribute their own files carry, because StationRail.tsx and MatrixReview.tsx
 * belong to the Design Station and Findings builders in this wave and this
 * model had to work before either of them opened a file. `[data-roving]` is
 * the contract for everything after: a container carrying `data-roving="list"`
 * or `data-roving="grid"` with `data-roving-item` on its children gets the
 * behaviour with no entry here. tests/keyboard.test.ts reads both surface
 * sources, so a class rename fails the suite rather than silently removing the
 * arrows.
 */

export type RovingLayout = "list" | "grid";

export interface RovingGroup {
  readonly id: string;
  /** The element the group lives in. */
  readonly container: string;
  /** The focusable members, found inside the container. */
  readonly item: string;
  readonly layout: RovingLayout;
  /** Grid only: the element one row of items sits in. */
  readonly row?: string;
}

export const ROVING_GROUPS: readonly RovingGroup[] = [
  // Eight stations, one stop. The rail is two <ol>s and a hub label, so the
  // container is the <nav> around all of it and the ring reads as one list,
  // which is what the rail became at M21 anyway.
  { id: "rail", container: "nav.rail", item: "button.rail-item", layout: "list" },
  // Nine biases by seven contexts. Left and right cross a row, up and down a
  // column, which is the only reason to draw a matrix at all.
  {
    id: "bias-grid",
    container: "table.coverage-grid",
    item: "button.cg-mark",
    layout: "grid",
    row: "tr",
  },
  { id: "declared-list", container: '[data-roving="list"]', item: "[data-roving-item]", layout: "list" },
  {
    id: "declared-grid",
    container: '[data-roving="grid"]',
    item: "[data-roving-item]",
    layout: "grid",
    row: "[data-roving-row]",
  },
];

interface LiveGroup {
  readonly group: RovingGroup;
  readonly container: HTMLElement;
  readonly items: readonly HTMLElement[];
}

function itemsOf(group: RovingGroup, container: HTMLElement): readonly HTMLElement[] {
  return [...container.querySelectorAll(group.item)].filter(
    (el): el is HTMLElement => el instanceof HTMLElement && !el.hasAttribute("disabled"),
  );
}

function liveGroups(root: ParentNode): readonly LiveGroup[] {
  const out: LiveGroup[] = [];
  for (const group of ROVING_GROUPS) {
    for (const container of root.querySelectorAll(group.container)) {
      if (!(container instanceof HTMLElement)) continue;
      const items = itemsOf(group, container);
      if (items.length > 1) out.push({ group, container, items });
    }
  }
  return out;
}

/**
 * Which member is the group's tab stop. The one the researcher last focused,
 * else the one the surface already marks as current, else the first. Reading
 * the surface's own marker matters on the rail: arriving on /design/site and
 * tabbing into the rail should land on Site selection rather than on Context,
 * and the rail already says which one that is.
 */
function preferredIndex(items: readonly HTMLElement[]): number {
  const roved = items.findIndex((el) => el.tabIndex === 0);
  if (roved >= 0) return roved;
  const current = items.findIndex(
    (el) => el.dataset["current"] === "true" || el.hasAttribute("aria-current"),
  );
  return current >= 0 ? current : 0;
}

/** One tab stop per group, and every other member out of the tab order. */
export function syncRoving(root: ParentNode): number {
  let groups = 0;
  for (const { items } of liveGroups(root)) {
    const active = preferredIndex(items);
    items.forEach((el, i) => {
      el.tabIndex = i === active ? 0 : -1;
    });
    groups += 1;
  }
  return groups;
}

function focusItem(items: readonly HTMLElement[], index: number): void {
  const next = items[index];
  if (next === undefined) return;
  for (const el of items) el.tabIndex = el === next ? 0 : -1;
  next.focus();
}

function groupHolding(root: ParentNode, el: Element | null): LiveGroup | undefined {
  const groups = liveGroups(root);
  if (el !== null) {
    const found = groups.find((g) => g.items.includes(el as HTMLElement));
    if (found !== undefined) return found;
  }
  return groups[0];
}

/**
 * Grid coordinates for one item. Rows come from the row selector so a header
 * row with no marks in it does not shift every column by one, which is what a
 * flat index over 63 cells would do on the coverage table's two header rows.
 */
function gridPosition(
  group: RovingGroup,
  container: HTMLElement,
  item: HTMLElement,
): { rows: readonly (readonly HTMLElement[])[]; row: number; column: number } {
  const rowSelector = group.row ?? "tr";
  const rows: HTMLElement[][] = [];
  for (const rowEl of container.querySelectorAll(rowSelector)) {
    if (!(rowEl instanceof HTMLElement)) continue;
    const cells = itemsOf(group, rowEl);
    if (cells.length > 0) rows.push([...cells]);
  }
  for (let r = 0; r < rows.length; r += 1) {
    const cells = rows[r] ?? [];
    const c = cells.indexOf(item);
    if (c >= 0) return { rows, row: r, column: c };
  }
  return { rows, row: 0, column: 0 };
}

/** j and k, and anything else that wants the group's next member. */
export function moveRoving(root: ParentNode, delta: 1 | -1): boolean {
  const active = root instanceof Document ? root.activeElement : null;
  const live = groupHolding(root, active);
  if (live === undefined) return false;
  const { items } = live;
  const at = items.indexOf(active as HTMLElement);
  if (at < 0) {
    focusItem(items, preferredIndex(items));
    return true;
  }
  focusItem(items, (at + delta + items.length) % items.length);
  return true;
}

const HORIZONTAL = new Set(["ArrowLeft", "ArrowRight"]);
const VERTICAL = new Set(["ArrowUp", "ArrowDown"]);

/**
 * The listener. Arrows move inside the group, Home and End go to its ends, and
 * everything else is left alone: this never sees a key that is not one of six,
 * and it never touches an event the surface has already handled.
 */
export function installRoving(doc: Document): () => void {
  let frame = 0;
  const schedule = () => {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      syncRoving(doc);
    });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const live = liveGroups(doc).find((g) => g.items.includes(target));
    if (live === undefined) return;
    const { group, container, items } = live;
    const at = items.indexOf(target);

    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      focusItem(items, e.key === "Home" ? 0 : items.length - 1);
      return;
    }
    if (!HORIZONTAL.has(e.key) && !VERTICAL.has(e.key)) return;

    if (group.layout === "list") {
      e.preventDefault();
      const forward = e.key === "ArrowDown" || e.key === "ArrowRight";
      focusItem(items, (at + (forward ? 1 : -1) + items.length) % items.length);
      return;
    }

    const { rows, row, column } = gridPosition(group, container, target);
    e.preventDefault();
    if (HORIZONTAL.has(e.key)) {
      const line = rows[row] ?? [];
      const next = (column + (e.key === "ArrowRight" ? 1 : -1) + line.length) % line.length;
      const el = line[next];
      if (el !== undefined) focusItem(items, items.indexOf(el));
      return;
    }
    const nextRow = (row + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
    const line = rows[nextRow] ?? [];
    // Rows are the same length on this grid, and a short one clamps rather
    // than wrapping to its own start, so a column walk stays in its column.
    const el = line[Math.min(column, line.length - 1)];
    if (el !== undefined) focusItem(items, items.indexOf(el));
  };

  const onFocusIn = (e: FocusEvent) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const live = liveGroups(doc).find((g) => g.items.includes(target));
    if (live === undefined) return;
    for (const el of live.items) el.tabIndex = el === target ? 0 : -1;
  };

  doc.addEventListener("keydown", onKeyDown);
  doc.addEventListener("focusin", onFocusIn);
  const observer = new MutationObserver(schedule);
  observer.observe(doc.body, { childList: true, subtree: true });
  syncRoving(doc);

  return () => {
    doc.removeEventListener("keydown", onKeyDown);
    doc.removeEventListener("focusin", onFocusIn);
    observer.disconnect();
    if (frame !== 0) cancelAnimationFrame(frame);
  };
}
